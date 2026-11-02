/// <reference lib='webworker' />

export type ImageThumbnailRequest = { id: number; url: string; size: number };
/** `blob` is null when the original should be shown as is. */
export type ImageThumbnailResponse = { id: number; blob: Blob | null };

/** A stalled host must not hold a decode slot forever. */
const FETCH_TIMEOUT_MS = 15_000;
/** Files this small aren't worth decoding just to find out. */
const MIN_BYTES = 40_000;
/** Only shrink when it saves real pixels: the short side must exceed the target by this much. */
const MIN_SHRINK = 1.25;

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

/** Whether the file is (or may be) animated. A still frame of it would freeze the avatar. */
function isAnimated(head: Uint8Array): boolean {
  if (ascii(head, 0, 4) === 'GIF8') return true;
  // WebP: VP8X header with the animation flag.
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') {
    return ascii(head, 12, 4) === 'VP8X' && (head[20] & 0x02) !== 0;
  }
  // APNG: an acTL chunk ahead of the image data.
  if (head[0] === 0x89 && ascii(head, 1, 3) === 'PNG') {
    return ascii(head, 0, head.length).includes('acTL');
  }
  // AVIF image sequences.
  if (ascii(head, 4, 4) === 'ftyp') {
    return ascii(head, 8, 32).includes('avis');
  }
  return false;
}

async function shrink(url: string, size: number): Promise<Blob | null> {
  const response = await fetch(url, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) return null;
  const source = await response.blob();
  if (source.size < MIN_BYTES) return null;

  const head = new Uint8Array(await source.slice(0, 4096).arrayBuffer());
  if (isAnimated(head)) return null;

  const bitmap = await createImageBitmap(source);
  try {
    const shortSide = Math.min(bitmap.width, bitmap.height);
    if (shortSide < size * MIN_SHRINK) return null;

    const scale = size / shortSide;
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
  } finally {
    bitmap.close();
  }
}

self.onmessage = async (event: MessageEvent<ImageThumbnailRequest>) => {
  const { id, url, size } = event.data;
  let blob: Blob | null = null;
  try {
    blob = await shrink(url, size);
  } catch {
    // CORS refusal, network error, undecodable or vector image: show the original.
    blob = null;
  }
  self.postMessage({ id, blob } satisfies ImageThumbnailResponse);
};
