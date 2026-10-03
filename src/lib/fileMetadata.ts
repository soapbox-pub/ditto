import { encode as blurhashEncode } from 'blurhash';

import { fileCategory } from '@/lib/mediaUrls';

/**
 * NIP-94 metadata worked out from a file in the browser before it's posted,
 * so viewers get dimensions, durations, placeholders and previews without
 * downloading the file themselves.
 */
export interface FileMeta {
  /** imeta fields (`dim`, `blurhash`, `duration`, `summary`, `alt`). */
  fields: [string, string][];
  /**
   * A still to upload and attach as the imeta `image` — a video's opening
   * frame, a font specimen.
   */
  preview?: File;
}

/** Longest a single probe may run before it's abandoned. */
const PROBE_TIMEOUT_MS = 15_000;

/** Largest zip read for its file listing (fflate reads the whole archive). */
const MAX_ZIP_LIST_BYTES = 64 * 1024 * 1024;

/** Characters of a text file kept as its summary. */
const SUMMARY_CHARS = 280;

/** Width of the canvas sample a blurhash is computed from. */
const BLURHASH_SAMPLE_W = 64;

function withTimeout<T>(promise: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Blurhash of anything drawable, sampled down to a small canvas. */
function blurhashOf(source: CanvasImageSource, width: number, height: number): string | undefined {
  if (!width || !height) return undefined;
  const sampleH = Math.max(1, Math.round(height * (BLURHASH_SAMPLE_W / width)));
  const canvas = document.createElement('canvas');
  canvas.width = BLURHASH_SAMPLE_W;
  canvas.height = sampleH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(source, 0, 0, BLURHASH_SAMPLE_W, sampleH);
  const { data } = ctx.getImageData(0, 0, BLURHASH_SAMPLE_W, sampleH);
  // 4x3 components: enough detail, short hash.
  return blurhashEncode(data, BLURHASH_SAMPLE_W, sampleH, 4, 3);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function imageMeta(file: Blob): Promise<FileMeta> {
  const url = URL.createObjectURL(file);
  try {
    const img = await withTimeout(loadImage(url));
    if (!img?.naturalWidth || !img.naturalHeight) return { fields: [] };
    const fields: [string, string][] = [['dim', `${img.naturalWidth}x${img.naturalHeight}`]];
    const blurhash = blurhashOf(img, img.naturalWidth, img.naturalHeight);
    if (blurhash) fields.push(['blurhash', blurhash]);
    return { fields };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Format seconds the way NIP-71 does: decimal seconds. */
function formatDuration(seconds: number): string | undefined {
  return Number.isFinite(seconds) && seconds > 0 ? String(Math.round(seconds * 1000) / 1000) : undefined;
}

/** Dimensions, duration, opening frame and blurhash of a video. */
async function videoMeta(file: File): Promise<FileMeta> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    const loaded = await withTimeout(new Promise<boolean>((resolve) => {
      video.onloadeddata = () => resolve(true);
      video.onerror = () => resolve(false);
      video.src = url;
    }));
    if (!loaded) return { fields: [] };

    const fields: [string, string][] = [];
    const { videoWidth: w, videoHeight: h } = video;
    if (w && h) fields.push(['dim', `${w}x${h}`]);
    const duration = formatDuration(video.duration);
    if (duration) fields.push(['duration', duration]);
    if (!w || !h) return { fields };

    // The very first frame is often black; a moment in is representative.
    const at = Number.isFinite(video.duration) ? Math.min(1, video.duration / 4) : 0;
    if (at > 0) {
      await withTimeout(new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = at;
      }), 5_000);
    }

    const scale = Math.min(1, 1280 / w);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return { fields };
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const blurhash = blurhashOf(canvas, canvas.width, canvas.height);
    if (blurhash) fields.push(['blurhash', blurhash]);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    // A blank frame encodes to a few hundred bytes; not worth posting.
    const preview = blob && blob.size > 750
      ? new File([blob], `${baseName(file.name)}-poster.jpg`, { type: 'image/jpeg' })
      : undefined;
    return { fields, preview };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function audioMeta(file: File): Promise<FileMeta> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  try {
    const duration = await withTimeout(new Promise<number | undefined>((resolve) => {
      audio.onloadedmetadata = () => resolve(audio.duration);
      audio.onerror = () => resolve(undefined);
      audio.src = url;
    }));
    const value = duration !== undefined ? formatDuration(duration) : undefined;
    return { fields: value ? [['duration', value]] : [] };
  } finally {
    audio.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

/** A specimen of a font, drawn in the font itself. */
async function fontMeta(file: File): Promise<FileMeta> {
  const family = `ditto-preview-${crypto.randomUUID()}`;
  const face = new FontFace(family, await file.arrayBuffer());
  const loaded = await withTimeout(face.load());
  if (!loaded) return { fields: [] };
  document.fonts.add(face);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 630;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { fields: [] };
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.textBaseline = 'middle';
    ctx.font = `160px "${family}"`;
    ctx.fillText('Aa Bb Cc', 80, 220);
    ctx.font = `64px "${family}"`;
    ctx.fillText('The quick brown fox jumps', 80, 400);
    ctx.fillText('0123456789 &?!', 80, 500);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return { fields: [] };
    return { fields: [], preview: new File([blob], `${baseName(file.name)}-specimen.png`, { type: 'image/png' }) };
  } finally {
    document.fonts.delete(face);
  }
}

/** The opening of a text file, on one line. */
async function textMeta(file: File): Promise<FileMeta> {
  const head = await file.slice(0, 8192).text();
  // A NUL means binary content behind a text extension.
  if (head.includes('\u0000')) return { fields: [] };
  const excerpt = head.replace(/\s+/g, ' ').trim();
  if (!excerpt) return { fields: [] };
  const summary = excerpt.length > SUMMARY_CHARS ? `${excerpt.slice(0, SUMMARY_CHARS - 1).trimEnd()}…` : excerpt;
  return { fields: [['summary', summary]] };
}

/** A zip's file count and first few names. */
async function zipMeta(file: File): Promise<FileMeta> {
  if (file.size > MAX_ZIP_LIST_BYTES) return { fields: [] };
  const { unzip } = await import('fflate');
  const data = new Uint8Array(await file.arrayBuffer());
  const names = await withTimeout(new Promise<string[]>((resolve) => {
    const seen: string[] = [];
    // The filter sees every entry; refusing all of them lists without inflating.
    unzip(data, {
      filter: (entry) => {
        if (!entry.name.endsWith('/')) seen.push(entry.name);
        return false;
      },
    }, (err) => resolve(err ? [] : seen));
  }));
  if (!names?.length) return { fields: [] };
  const shown = names.slice(0, 8).join(', ');
  const rest = names.length > 8 ? `, … (${names.length} files)` : '';
  const summary = `${shown}${rest}`;
  return { fields: [['summary', summary.length > 500 ? `${summary.slice(0, 499)}…` : summary]] };
}

function baseName(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return (dot > 0 ? filename.slice(0, dot) : filename) || 'file';
}

/**
 * Work out what can be said about a file before it's posted. Never throws:
 * a file the browser can't decode just comes back with less.
 *
 * Non-media files also carry their original name as `alt`. A Blossom URL is
 * just a hash, so without it a shared `report.pdf` reaches viewers nameless.
 * Photos, videos and recordings don't: a camera's filename says nothing a
 * viewer needs, and can say things the poster didn't mean to share.
 */
export async function readFileMeta(file: File, mime: string): Promise<FileMeta> {
  const category = fileCategory(mime);
  let meta: FileMeta = { fields: [] };
  try {
    switch (category) {
      case 'image': meta = await imageMeta(file); break;
      case 'video': meta = await videoMeta(file); break;
      case 'audio': meta = await audioMeta(file); break;
      case 'font': meta = await fontMeta(file); break;
      case 'text':
      case 'spreadsheet':
        if (mime.startsWith('text/') || category === 'text') meta = await textMeta(file);
        break;
      case 'archive':
        if (mime === 'application/zip' || mime === 'application/java-archive') meta = await zipMeta(file);
        break;
    }
  } catch {
    // Keep whatever we had.
  }

  if (category !== 'webxdc' && !/^(image|video|audio)\//.test(mime) && file.name) {
    meta.fields.push(['alt', file.name.slice(0, 200)]);
  }
  return meta;
}
