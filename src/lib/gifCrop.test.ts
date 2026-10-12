import { describe, expect, it } from 'vitest';
import { GIFEncoder, type Palette } from 'gifenc';
import { decompressFrames, parseGIF } from 'gifuct-js';

import { cropGif } from './gifCrop';

const RED = [255, 0, 0];
const GREEN = [0, 255, 0];
const BLUE = [0, 0, 255];
const WHITE = [255, 255, 255];

interface TestFrame {
  index: number[];
  delay?: number;
  transparentIndex?: number;
}

function makeGif(w: number, h: number, palette: Palette, frames: TestFrame[], repeat = 0): Uint8Array {
  const enc = GIFEncoder();
  frames.forEach((f, i) => {
    enc.writeFrame(Uint8Array.from(f.index), w, h, {
      palette: i === 0 ? palette : undefined,
      delay: f.delay ?? 100,
      repeat,
      transparent: f.transparentIndex !== undefined,
      transparentIndex: f.transparentIndex ?? 0,
      dispose: f.transparentIndex !== undefined ? 1 : -1,
    });
  });
  enc.finish();
  return enc.bytes();
}

function decode(bytes: Uint8Array) {
  const gif = parseGIF(bytes.slice().buffer);
  const frames = decompressFrames(gif, true);
  const pixel = (frame: number, x: number, y: number) => {
    const p = (y * gif.lsd.width + x) * 4;
    return Array.from(frames[frame].patch.slice(p, p + 4));
  };
  return { gif, frames, pixel };
}

const quadrants = (swap = false) => Array.from({ length: 16 }, (_, i) => {
  const q = (i % 4 < 2 ? 0 : 1) + (i < 8 ? 0 : 2);
  return swap ? 3 - q : q;
});

describe('cropGif', () => {
  it('crops every frame and keeps delays and the loop count', () => {
    const src = makeGif(4, 4, [RED, GREEN, BLUE, WHITE], [
      { index: quadrants(), delay: 70 },
      { index: quadrants(true), delay: 200 },
    ], 3);
    const out = cropGif(src, { x: 2, y: 0, width: 2, height: 2 })!;
    const { gif, frames, pixel } = decode(out);

    expect(gif.lsd.width).toBe(2);
    expect(gif.lsd.height).toBe(2);
    expect(frames.map((f) => f.delay)).toEqual([70, 200]);
    expect(pixel(0, 0, 0)).toEqual([...GREEN, 255]);
    expect(pixel(0, 1, 1)).toEqual([...GREEN, 255]);
    expect(pixel(1, 0, 0)).toEqual([...BLUE, 255]);
    const app = gif.frames.find((f) => 'application' in f) as { application: { blocks: number[] } };
    expect(Array.from(app.application.blocks)).toEqual([1, 3, 0]);
  });

  it('composites a partially transparent frame over the one before it', () => {
    const src = makeGif(2, 2, [RED, BLUE], [
      { index: [0, 0, 0, 0] },
      { index: [0, 1, 0, 0], transparentIndex: 0 },
    ]);
    const { pixel } = decode(cropGif(src, { x: 0, y: 0, width: 2, height: 2 })!);
    expect(pixel(1, 0, 0)).toEqual([...RED, 255]);
    expect(pixel(1, 1, 0)).toEqual([...BLUE, 255]);
  });

  it('keeps transparent pixels transparent', () => {
    const src = makeGif(2, 1, [RED, GREEN], [{ index: [0, 1], transparentIndex: 1 }]);
    const { pixel } = decode(cropGif(src, { x: 0, y: 0, width: 2, height: 1 })!);
    expect(pixel(0, 0, 0)).toEqual([...RED, 255]);
    expect(pixel(0, 1, 0)[3]).toBe(0);
  });

  it('scales a crop larger than maxEdge down', () => {
    const src = makeGif(4, 4, [RED, GREEN, BLUE, WHITE], [{ index: quadrants() }]);
    const { gif, pixel } = decode(cropGif(src, { x: 0, y: 0, width: 4, height: 4 }, 2)!);
    expect(gif.lsd.width).toBe(2);
    expect(pixel(0, 0, 0)).toEqual([...RED, 255]);
    expect(pixel(0, 1, 1)).toEqual([...WHITE, 255]);
  });

  it('quantizes to one shared palette past 256 colours', () => {
    const w = 32;
    const h = 16;
    const palette: Palette = Array.from({ length: 256 }, (_, i) => [i, 255 - i, 128]);
    const shift = (s: number) => Array.from({ length: w * h }, (_, i) => (i + s) % 256);
    const enc = GIFEncoder();
    enc.writeFrame(Uint8Array.from(shift(0)), w, h, { palette, repeat: 0 });
    enc.writeFrame(Uint8Array.from(shift(7)), w, h, { palette: palette.map(([r, g]) => [g, r, 7]) });
    enc.finish();

    const { gif, frames } = decode(cropGif(enc.bytes(), { x: 0, y: 0, width: w, height: h })!);
    expect(frames).toHaveLength(2);
    expect(gif.gct.length).toBeLessThanOrEqual(256);
    expect(frames.every((f) => f.colorTable === gif.gct)).toBe(true);
  });

  it('clamps a crop that runs past the image', () => {
    const src = makeGif(4, 4, [RED, GREEN, BLUE, WHITE], [{ index: quadrants() }]);
    const { gif } = decode(cropGif(src, { x: 3, y: 3, width: 10, height: 10 })!);
    expect([gif.lsd.width, gif.lsd.height]).toEqual([1, 1]);
  });

  it('returns null for bytes that are not a GIF', () => {
    expect(cropGif(new Uint8Array([1, 2, 3, 4]), { x: 0, y: 0, width: 1, height: 1 })).toBeNull();
  });
});
