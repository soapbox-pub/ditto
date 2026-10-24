/// <reference lib="webworker" />

/**
 * The one place mediabunny touches an outgoing video: probes it, decides
 * what to do via `./policy.ts`, runs the remux or transcode (WebCodecs), and
 * pulls out its NIP-94 metadata (dim, duration, blurhash, poster).
 */

import { encode as blurhashEncode } from 'blurhash';
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  type AudioCodec,
  type InputVideoTrack,
  type MetadataTags,
} from 'mediabunny';

import {
  AUDIO_BITRATE,
  decideVideoAction,
  isFastStartMp4,
  KEYFRAME_INTERVAL,
  type VideoAction,
  type VideoProbe,
} from './policy';

import { repairAvcDecoderConfig } from './avcc';

import type { ProcessedVideo, VideoWorkerRequest, VideoWorkerResponse } from './types';

/** Longest edge of the poster frame, in pixels. */
const POSTER_MAX_EDGE = 1280;

/** JPEG quality for the poster frame. */
const POSTER_QUALITY = 0.8;

/** Width used to sample pixels for the blurhash (matches the image path). */
const BLURHASH_SAMPLE_WIDTH = 64;

/** Audio codecs MP4 can carry untouched (copying beats re-encoding). */
const MP4_AUDIO_CODECS = new Set<AudioCodec>(['aac', 'opus', 'mp3', 'flac', 'ac3', 'eac3']);

/** The in-flight conversion, so a cancel message can abort it. */
let active: Conversion | null = null;

installAvcDescriptionRepair();

/**
 * Mediabunny copies the encoder's `avcC` into the MP4 verbatim, and some
 * browsers' encoders emit a malformed one that iOS won't play (see `./avcc.ts`).
 * Mediabunny constructs encoders through the global, so swap in a subclass
 * that repairs the description before the muxer sees it.
 */
function installAvcDescriptionRepair(): void {
  const NativeVideoEncoder = self.VideoEncoder;
  if (typeof NativeVideoEncoder !== 'function') return;

  class RepairingVideoEncoder extends NativeVideoEncoder {
    constructor(init: VideoEncoderInit) {
      super({
        ...init,
        output: (chunk, metadata) => init.output(chunk, repairMetadata(metadata)),
      });
    }
  }

  self.VideoEncoder = RepairingVideoEncoder;
}

function repairMetadata(metadata?: EncodedVideoChunkMetadata): EncodedVideoChunkMetadata | undefined {
  const config = metadata?.decoderConfig;
  if (!config?.description || !config.codec.startsWith('avc1')) return metadata;

  const description = ArrayBuffer.isView(config.description)
    ? new Uint8Array(config.description.buffer, config.description.byteOffset, config.description.byteLength)
    : new Uint8Array(config.description);

  const repaired = repairAvcDecoderConfig(description);
  if (!repaired) return metadata;

  return { ...metadata, decoderConfig: { ...config, description: repaired } };
}

self.onmessage = async (event: MessageEvent<VideoWorkerRequest>) => {
  const message = event.data;

  if (message.type === 'cancel') {
    await active?.cancel().catch(() => {});
    return;
  }

  try {
    const result = await process(message.file);
    post({ type: 'done', result });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  } finally {
    active = null;
  }
};

function post(response: VideoWorkerResponse): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(response);
}

async function process(file: File): Promise<ProcessedVideo> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  const videoTrack = await input.getPrimaryVideoTrack();
  if (!videoTrack) {
    return { file, action: 'passthrough' };
  }

  const probe = await buildProbe(file, input, videoTrack);
  const action = decideVideoAction(probe);

  // Preview from the source, so passthrough paths get one too.
  const preview = await extractPreview(videoTrack, probe.width, probe.height);

  const base = {
    duration: probe.duration > 0 ? probe.duration : undefined,
    blurhash: preview?.blurhash,
    poster: preview?.poster,
  };

  if (action.kind === 'passthrough') {
    return { ...base, file, dim: dimOf(probe.width, probe.height), action: 'passthrough' };
  }

  const converted = await convert(file, input, action);
  if (!converted) {
    // Conversion impossible (e.g. no audio encoder): send the original.
    return { ...base, file, dim: dimOf(probe.width, probe.height), action: 'passthrough' };
  }

  return {
    ...base,
    file: converted,
    dim: action.kind === 'transcode'
      ? dimOf(action.width, action.height)
      : dimOf(probe.width, probe.height),
    action: action.kind,
  };
}

async function buildProbe(
  file: File,
  input: Input,
  videoTrack: InputVideoTrack,
): Promise<VideoProbe> {
  const [width, height, duration, tags] = await Promise.all([
    videoTrack.getDisplayWidth(),
    videoTrack.getDisplayHeight(),
    input.computeDuration().catch(() => 0),
    input.getMetadataTags().catch(() => ({}) as MetadataTags),
  ]);

  const canEncode = (await getFirstEncodableVideoCodec(['avc'], { width, height })) !== null;

  const isFastStart = await isFastStartMp4(
    async (offset, length) => new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()),
    file.size,
  ).catch(() => false);

  return {
    size: file.size,
    duration,
    width,
    height,
    codec: videoTrack.codec,
    mimeType: file.type,
    canEncode,
    isFastStart,
    hasMetadataTags: hasMeaningfulTags(tags),
  };
}

/** Any populated tag counts (`date` and `raw` hold timestamps and GPS). */
function hasMeaningfulTags(tags: MetadataTags): boolean {
  for (const [key, value] of Object.entries(tags)) {
    if (value === undefined || value === null) continue;
    if (key === 'raw') {
      if (typeof value === 'object' && Object.keys(value).length > 0) return true;
      continue;
    }
    if (Array.isArray(value) && value.length === 0) continue;
    return true;
  }
  return false;
}

/** JPEG poster + blurhash from a frame ~1s in (first frames are often black). */
async function extractPreview(
  videoTrack: InputVideoTrack,
  width: number,
  height: number,
): Promise<{ poster: Blob; blurhash?: string } | undefined> {
  try {
    if (!(width > 0) || !(height > 0) || !(await videoTrack.canDecode())) return undefined;

    const first = await videoTrack.getFirstTimestamp();
    const duration = await videoTrack.computeDuration();
    const timestamp = duration > 2 ? first + 1 : first + Math.max(0, duration - first) / 2;

    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(width, height));
    const sink = new CanvasSink(videoTrack, { width: Math.max(1, Math.round(width * scale)) });
    const wrapped = (await sink.getCanvas(timestamp)) ?? (await sink.getCanvas(first));
    if (!wrapped) return undefined;

    const poster = await toJpeg(wrapped.canvas);
    return { poster, blurhash: computeBlurhash(wrapped.canvas) };
  } catch {
    return undefined;
  }
}

async function toJpeg(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: 'image/jpeg', quality: POSTER_QUALITY });
  }
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode poster'))),
      'image/jpeg',
      POSTER_QUALITY,
    );
  });
}

/** Downscale to a small canvas and encode a 4x3-component blurhash. */
function computeBlurhash(source: HTMLCanvasElement | OffscreenCanvas): string | undefined {
  try {
    const scale = BLURHASH_SAMPLE_WIDTH / source.width;
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = new OffscreenCanvas(BLURHASH_SAMPLE_WIDTH, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    ctx.drawImage(source, 0, 0, BLURHASH_SAMPLE_WIDTH, height);
    const { data } = ctx.getImageData(0, 0, BLURHASH_SAMPLE_WIDTH, height);

    return blurhashEncode(data, BLURHASH_SAMPLE_WIDTH, height, 4, 3);
  } catch {
    return undefined;
  }
}

/** Run the remux or transcode; `null` means upload the original. */
async function convert(
  file: File,
  input: Input,
  action: Extract<VideoAction, { kind: 'remux' | 'transcode' }>,
): Promise<File | null> {
  const output = new Output({
    // Fast start: `moov` before `mdat` so playback starts before full download.
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });

  const conversion = await Conversion.init({
    input,
    output,
    tracks: 'primary',
    // Drop all metadata tags (creation date, GPS).
    tags: {},
    ...(action.kind === 'transcode'
      ? {
        video: {
          width: action.width,
          height: action.height,
          // Dims keep the true aspect within rounding to 16, so fill beats letterboxing.
          fit: 'fill' as const,
          codec: 'avc' as const,
          bitrate: action.videoBitrate,
          keyFrameInterval: KEYFRAME_INTERVAL,
        },
        audio: audioOptions,
      }
      : {}),
  });

  if (!conversion.isValid) return null;

  // Never silently drop audio.
  if (conversion.discardedTracks.some((t) => t.track.type === 'audio')) return null;

  active = conversion;
  conversion.onProgress = (progress) => post({ type: 'progress', value: progress });

  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) return null;

  return new File([buffer], replaceExtension(file.name, '.mp4'), { type: 'video/mp4' });
}

/** Copy audio when MP4 can hold it; encode only foreign codecs (e.g. Vorbis). */
async function audioOptions(track: { codec: AudioCodec | null }) {
  if (track.codec && MP4_AUDIO_CODECS.has(track.codec)) return {};

  const codec = await getFirstEncodableAudioCodec(['aac', 'opus']);
  if (!codec) return {};

  return { codec, bitrate: AUDIO_BITRATE };
}

function dimOf(width: number, height: number): string | undefined {
  return width > 0 && height > 0 ? `${width}x${height}` : undefined;
}

function replaceExtension(filename: string, ext: string): string {
  const dot = filename.lastIndexOf('.');
  return (dot > 0 ? filename.slice(0, dot) : filename) + ext;
}
