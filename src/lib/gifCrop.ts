import { applyPalette, GIFEncoder, quantize, type Palette } from 'gifenc';
import { decompressFrame, parseGIF, type ParsedGif } from 'gifuct-js';

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

type GifFrame = Extract<ParsedGif['frames'][number], { image: unknown }>;

/** Ceiling on frames × canvas pixels. */
export const MAX_GIF_WORK = 50_000_000;

const QUANTIZE_SAMPLE = 500_000;

const ALPHA_CUTOFF = 128;

/**
 * Crop every frame of a GIF, keeping timing and loop count. One global
 * palette, since per-frame palettes flicker. Null if unreadable or too large.
 */
export function cropGif(bytes: Uint8Array, area: CropArea, maxEdge?: number): Uint8Array | null {
  let gif: ParsedGif;
  try {
    gif = parseGIF(bytes.slice().buffer);
  } catch {
    return null;
  }
  const { width: W, height: H } = gif.lsd;
  const frames = gif.frames.filter((f): f is GifFrame => 'image' in f);
  if (!frames.length || !(W > 0) || !(H > 0) || frames.length * W * H > MAX_GIF_WORK) return null;

  const x0 = clamp(Math.round(area.x), 0, W - 1);
  const y0 = clamp(Math.round(area.y), 0, H - 1);
  const cw = clamp(Math.round(area.width), 1, W - x0);
  const ch = clamp(Math.round(area.height), 1, H - y0);
  const scale = maxEdge ? Math.min(1, maxEdge / Math.max(cw, ch)) : 1;
  const ow = Math.max(1, Math.round(cw * scale));
  const oh = Math.max(1, Math.round(ch * scale));
  const crop = makeCropper(W, x0, y0, cw, ch, ow, oh);
  const pixels = ow * oh;

  const exact = new Map<number, number>();
  let overflow = false;
  let transparent = false;
  const stride = Math.max(1, Math.ceil((frames.length * pixels) / QUANTIZE_SAMPLE));
  const sample = new Uint8Array(Math.ceil((frames.length * pixels) / stride) * 4);
  let sampled = 0;
  let seen = 0;
  composite(gif, frames, (canvas) => {
    const out = crop(canvas);
    for (let i = 0; i < pixels; i++, seen++) {
      const p = i * 4;
      if (out[p + 3] < ALPHA_CUTOFF) {
        transparent = true;
        continue;
      }
      if (!overflow) {
        const key = (out[p] << 16) | (out[p + 1] << 8) | out[p + 2];
        if (!exact.has(key)) {
          exact.set(key, exact.size);
          if (exact.size > 256) overflow = true;
        }
      }
      if (seen % stride === 0) {
        sample.set([out[p], out[p + 1], out[p + 2], 255], sampled * 4);
        sampled++;
      }
    }
  });

  const maxColors = transparent ? 255 : 256;
  const useExact = !overflow && exact.size <= maxColors;
  let colors: Palette;
  if (useExact) {
    colors = [...exact.keys()].map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
  } else {
    colors = quantize(sample.subarray(0, sampled * 4), maxColors, { format: 'rgb565' });
  }
  if (!colors.length) colors = [[0, 0, 0]];
  const transparentIndex = colors.length;
  const palette = transparent ? [...colors, [0, 0, 0]] : colors;

  const encoder = GIFEncoder();
  const repeat = loopCount(gif);
  let first = true;
  composite(gif, frames, (canvas, delay) => {
    const out = crop(canvas);
    let index: Uint8Array;
    if (useExact) {
      index = new Uint8Array(pixels);
      for (let i = 0; i < pixels; i++) {
        const p = i * 4;
        index[i] = out[p + 3] < ALPHA_CUTOFF
          ? transparentIndex
          : exact.get((out[p] << 16) | (out[p + 1] << 8) | out[p + 2])!;
      }
    } else {
      index = applyPalette(out, colors, 'rgb565');
      if (transparent) {
        for (let i = 0; i < pixels; i++) if (out[i * 4 + 3] < ALPHA_CUTOFF) index[i] = transparentIndex;
      }
    }
    encoder.writeFrame(index, ow, oh, {
      palette: first ? palette : undefined,
      delay,
      repeat,
      transparent,
      transparentIndex,
    });
    first = false;
  });
  encoder.finish();
  return encoder.bytes();
}

function composite(
  gif: ParsedGif,
  frames: GifFrame[],
  visit: (canvas: Uint8ClampedArray, delay: number) => void,
): void {
  const { width: W, height: H } = gif.lsd;
  const canvas = new Uint8ClampedArray(W * H * 4);
  for (const frame of frames) {
    const f = decompressFrame(frame, gif.gct, false);
    const { top, left, width, height } = f.dims;
    const disposal = f.disposalType ?? 0;
    const saved = disposal === 3 ? canvas.slice() : undefined;
    const table = f.colorTable;
    const ti = f.transparentIndex ?? -1;
    for (let row = 0; row < height && top + row < H; row++) {
      for (let col = 0; col < width && left + col < W; col++) {
        const idx = f.pixels[row * width + col];
        if (idx === ti) continue;
        const c = table[idx];
        if (!c) continue;
        const p = ((top + row) * W + left + col) * 4;
        canvas[p] = c[0];
        canvas[p + 1] = c[1];
        canvas[p + 2] = c[2];
        canvas[p + 3] = 255;
      }
    }
    visit(canvas, f.delay ?? 100);
    if (disposal === 2) {
      for (let row = top; row < Math.min(H, top + height); row++) {
        canvas.fill(0, (row * W + left) * 4, (row * W + Math.min(W, left + width)) * 4);
      }
    } else if (saved) {
      canvas.set(saved);
    }
  }
}

function makeCropper(W: number, x0: number, y0: number, cw: number, ch: number, ow: number, oh: number) {
  const out = new Uint8ClampedArray(ow * oh * 4);
  if (ow === cw && oh === ch) {
    return (canvas: Uint8ClampedArray) => {
      for (let y = 0; y < ch; y++) {
        const from = ((y0 + y) * W + x0) * 4;
        out.set(canvas.subarray(from, from + cw * 4), y * cw * 4);
      }
      return out;
    };
  }
  const span = (o: number, n: number, src: number) => {
    const a = Math.floor((o * src) / n);
    return [a, Math.max(a + 1, Math.floor(((o + 1) * src) / n))] as const;
  };
  const xs = Array.from({ length: ow }, (_, o) => span(o, ow, cw));
  const ys = Array.from({ length: oh }, (_, o) => span(o, oh, ch));
  return (canvas: Uint8ClampedArray) => {
    for (let oy = 0; oy < oh; oy++) {
      const [sy0, sy1] = ys[oy];
      for (let ox = 0; ox < ow; ox++) {
        const [sx0, sx1] = xs[ox];
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = sy0; sy < sy1; sy++) {
          let p = ((y0 + sy) * W + x0 + sx0) * 4;
          for (let sx = sx0; sx < sx1; sx++, p += 4) {
            const al = canvas[p + 3];
            r += canvas[p] * al;
            g += canvas[p + 1] * al;
            b += canvas[p + 2] * al;
            a += al;
          }
        }
        const q = (oy * ow + ox) * 4;
        const n = (sy1 - sy0) * (sx1 - sx0);
        out[q] = a ? r / a : 0;
        out[q + 1] = a ? g / a : 0;
        out[q + 2] = a ? b / a : 0;
        out[q + 3] = a / n;
      }
    }
    return out;
  };
}

/** 0 loops forever; -1 plays once. */
function loopCount(gif: ParsedGif): number {
  for (const f of gif.frames) {
    if (!('application' in f) || !/^(NETSCAPE|ANIMEXTS)/.test(f.application.id)) continue;
    const blocks = f.application.blocks;
    if (blocks.length >= 3 && blocks[0] === 1) return blocks[1] | (blocks[2] << 8);
  }
  return -1;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
