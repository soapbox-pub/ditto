import { cropGif, type CropArea } from './gifCrop';
import type { GifCropRequest, GifCropResponse } from './gifCrop.worker';

export function isGifBytes(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x38;
}

export async function runGifCrop(blob: Blob, area: CropArea, maxEdge?: number): Promise<Blob | null> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out: Uint8Array | null;
  if (typeof Worker === 'undefined') {
    out = cropGif(bytes, area, maxEdge);
  } else {
    out = await new Promise<Uint8Array | null>((resolve) => {
      const worker = new Worker(new URL('./gifCrop.worker.ts', import.meta.url), { type: 'module' });
      const done = (result: Uint8Array | null) => {
        worker.terminate();
        resolve(result);
      };
      worker.onmessage = (event: MessageEvent<GifCropResponse>) => done(event.data.bytes);
      worker.onerror = () => done(null);
      worker.postMessage({ bytes, area, maxEdge } satisfies GifCropRequest, [bytes.buffer]);
    });
  }
  return out ? new Blob([out.slice()], { type: 'image/gif' }) : null;
}
