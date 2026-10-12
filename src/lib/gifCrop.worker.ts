/// <reference lib='webworker' />

import { cropGif, type CropArea } from './gifCrop';

export type GifCropRequest = { bytes: Uint8Array; area: CropArea; maxEdge?: number };
export type GifCropResponse = { bytes: Uint8Array | null };

self.onmessage = (event: MessageEvent<GifCropRequest>) => {
  const { bytes, area, maxEdge } = event.data;
  let out: Uint8Array | null = null;
  try {
    out = cropGif(bytes, area, maxEdge);
  } catch {
    out = null;
  }
  self.postMessage({ bytes: out } satisfies GifCropResponse, out ? [out.buffer] : []);
};
