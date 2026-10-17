/**
 * Pure decision logic for the outgoing-video pipeline; free of mediabunny/
 * WebCodecs so it's testable under jsdom.
 */

/** Maximum short edge (height for landscape) of a transcoded video. */
export const MAX_SHORT_EDGE = 720;

/** Maximum long edge (width for landscape) of a transcoded video. */
export const MAX_LONG_EDGE = 1280;

/** Target video bitrate at {@link MAX_LONG_EDGE}x{@link MAX_SHORT_EDGE}. */
export const VIDEO_BITRATE = 2_000_000;

/** Floor for the resolution-scaled video bitrate, so tiny clips stay watchable. */
export const MIN_VIDEO_BITRATE = 400_000;

/** Target audio bitrate when the audio track has to be re-encoded. */
export const AUDIO_BITRATE = 128_000;

/** Maximum seconds between key frames in a transcoded video. */
export const KEYFRAME_INTERVAL = 2;

/**
 * Above this, upload the original: output is buffered in memory
 * (`fastStart: 'in-memory'`) and a transcode's peak cost is unbounded; better than an OOM.
 */
export const MAX_INPUT_BYTES = 500 * 1024 * 1024;

/** Above this, skip remux: its in-memory output is about the input size. */
export const MAX_REMUX_BYTES = 100 * 1024 * 1024;

/** How far over the target bitrate a source may be before re-encoding (re-encodes cost quality and CPU). */
export const BITRATE_TOLERANCE = 1.2;

/** Container MIME types we can remux in place (ISOBMFF family). */
const REMUXABLE_MIME = /^video\/(mp4|quicktime|x-m4v)$/i;

/** What the worker should do with a video file. */
export type VideoAction =
  | {
    /** Upload the original bytes untouched. */
    kind: 'passthrough';
    reason: 'too-large' | 'no-encoder' | 'unreadable' | 'already-optimal';
  }
  | {
    /** Copy packets into a fresh MP4: strips metadata (GPS, dates) and moves `moov` first. */
    kind: 'remux';
  }
  | {
    /** Full decode/encode to the given dimensions and bitrates. */
    kind: 'transcode';
    width: number;
    height: number;
    videoBitrate: number;
    audioBitrate: number;
  };

/** Everything {@link decideVideoAction} needs to know about a source file. */
export interface VideoProbe {
  /** Source file size in bytes. */
  size: number;
  /** Duration in seconds. Zero/unknown disables the bitrate heuristic. */
  duration: number;
  /** Rotation-corrected display width in pixels. */
  width: number;
  /** Rotation-corrected display height in pixels. */
  height: number;
  /** Video codec as reported by mediabunny, e.g. `"avc"`. */
  codec: string | null;
  /** MIME type of the source container. */
  mimeType: string;
  /** Whether an H.264 encoder is actually available in this environment. */
  canEncode: boolean;
  /** Whether `moov` already precedes `mdat` (nothing to gain from a remux). */
  isFastStart: boolean;
  /** Whether the source carries metadata tags worth stripping (GPS, dates). */
  hasMetadataTags: boolean;
}

/**
 * Round to a multiple of 16: many hardware encoders (incl. Android MediaCodec)
 * fail on other dimensions. May exceed the cap by ≤8px.
 */
export function roundTo16(value: number): number {
  return Math.max(16, Math.round(value / 16) * 16);
}

/** Fit within the edge caps preserving aspect, rounded to 16. Never upscales. */
export function scaleToFit(width: number, height: number): { width: number; height: number } {
  const shortEdge = Math.min(width, height);
  const longEdge = Math.max(width, height);

  const scale = Math.min(
    MAX_SHORT_EDGE / shortEdge,
    MAX_LONG_EDGE / longEdge,
    1,
  );

  return {
    width: roundTo16(width * scale),
    height: roundTo16(height * scale),
  };
}

/** Video bitrate scaled by pixel count against the {@link VIDEO_BITRATE} reference. */
export function targetVideoBitrate(width: number, height: number): number {
  const ratio = (width * height) / (MAX_LONG_EDGE * MAX_SHORT_EDGE);
  return Math.round(
    Math.min(VIDEO_BITRATE, Math.max(MIN_VIDEO_BITRATE, VIDEO_BITRATE * ratio)),
  );
}

/** Average total bitrate of a file, in bits per second. `null` if unknowable. */
export function averageBitrate(size: number, duration: number): number | null {
  if (!(duration > 0) || !(size > 0)) return null;
  return (size * 8) / duration;
}

/**
 * Ladder: unreadable/oversized → passthrough; already compliant → remux (or
 * passthrough if nothing to gain); no encoder → passthrough; else transcode.
 */
export function decideVideoAction(probe: VideoProbe): VideoAction {
  if (!(probe.width > 0) || !(probe.height > 0)) {
    return { kind: 'passthrough', reason: 'unreadable' };
  }

  if (probe.size > MAX_INPUT_BYTES) {
    return { kind: 'passthrough', reason: 'too-large' };
  }

  const { width, height } = scaleToFit(probe.width, probe.height);
  const videoBitrate = targetVideoBitrate(width, height);

  if (isAlreadyCompliant(probe, videoBitrate)) {
    // Remux only if it buys metadata stripping or fast start.
    if (!probe.hasMetadataTags && probe.isFastStart) {
      return { kind: 'passthrough', reason: 'already-optimal' };
    }
    if (probe.size > MAX_REMUX_BYTES) {
      return { kind: 'passthrough', reason: 'too-large' };
    }
    return { kind: 'remux' };
  }

  if (!probe.canEncode) {
    return { kind: 'passthrough', reason: 'no-encoder' };
  }

  return { kind: 'transcode', width, height, videoBitrate, audioBitrate: AUDIO_BITRATE };
}

/** Already H.264/ISOBMFF, within the caps and {@link BITRATE_TOLERANCE} of target. */
function isAlreadyCompliant(probe: VideoProbe, videoBitrate: number): boolean {
  if (probe.codec !== 'avc') return false;
  if (!REMUXABLE_MIME.test(probe.mimeType)) return false;

  const shortEdge = Math.min(probe.width, probe.height);
  const longEdge = Math.max(probe.width, probe.height);
  if (shortEdge > MAX_SHORT_EDGE || longEdge > MAX_LONG_EDGE) return false;

  const actual = averageBitrate(probe.size, probe.duration);
  // Unknown duration: assume the worst.
  if (actual === null) return false;

  return actual <= (videoBitrate + AUDIO_BITRATE) * BITRATE_TOLERANCE;
}

/** Reads `length` bytes at `offset`. Returns fewer bytes at end of file. */
export type ByteReader = (offset: number, length: number) => Promise<Uint8Array>;

/**
 * Whether an ISOBMFF file has `moov` before `mdat` ("fast start"). Walks only
 * top-level box headers; `false` when unparseable (the caller then remuxes).
 */
export async function isFastStartMp4(read: ByteReader, size: number): Promise<boolean> {
  let offset = 0;

  // Bounded against zero-length-box loops.
  for (let i = 0; i < 64 && offset < size; i++) {
    const header = await read(offset, 16);
    if (header.length < 8) return false;

    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const type = String.fromCharCode(header[4], header[5], header[6], header[7]);

    if (type === 'moov') return true;
    if (type === 'mdat') return false;

    let boxSize = view.getUint32(0);
    if (boxSize === 1) {
      // 64-bit size: boxes over 4 GiB are out of scope, so require high half 0.
      if (header.length < 16) return false;
      const high = view.getUint32(8);
      if (high !== 0) return false;
      boxSize = view.getUint32(12);
    } else if (boxSize === 0) {
      return false;
    }

    if (boxSize < 8) return false;
    offset += boxSize;
  }

  return false;
}
