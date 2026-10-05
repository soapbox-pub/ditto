/**
 * The images Ditto's link previews draw, as ditto-server drew them: a
 * profile's avatar, cut to its shape, on its theme; a theme's colours as a
 * sketch of a page; a color moment's palette in its layout. Each is drawn on
 * an `OffscreenCanvas`, in npanel's sandbox or in a browser alike.
 */

import { drawEmojiMask } from '@/lib/avatarShape';
import { deriveTokensFromCore, hslStringToHex } from '@/lib/colorUtils';
import type { CoreThemeColors } from '@/themes';

const WIDTH = 1200;
const HEIGHT = 630;

/** ditto-server's colours for a profile whose theme is missing or broken. */
export const DEFAULT_COLORS: CoreThemeColors = { background: '228 20% 10%', text: '210 40% 98%', primary: '263 70% 50%' };

/** The avatar, cut to its shape, centred on the theme. */
export async function drawProfile(colors: CoreThemeColors, wallpaper: string | undefined, picture: string | undefined, shape: string | undefined): Promise<Blob> {
  const tokens = deriveTokensFromCore(colors.background, colors.text, colors.primary);
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hslStringToHex(tokens.background);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  await drawWallpaper(ctx, wallpaper);

  const size = 400;
  const avatar = new OffscreenCanvas(size, size);
  const actx = avatar.getContext('2d')!;
  const bitmap = picture ? await loadImage(picture) : null;
  if (bitmap) {
    drawCover(actx, bitmap, 0, 0, size, size);
  } else {
    actx.fillStyle = hslStringToHex(tokens.muted);
    actx.fillRect(0, 0, size, size);
  }

  // Keep only what's inside the shape: the emoji's silhouette, or a circle.
  const mask = shape ? drawEmojiMask(shape, (w, h) => new OffscreenCanvas(w, h), size) : null;
  actx.globalCompositeOperation = 'destination-in';
  if (mask) {
    actx.drawImage(mask, 0, 0);
  } else {
    actx.beginPath();
    actx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    actx.fill();
  }

  ctx.drawImage(avatar, (WIDTH - size) / 2, (HEIGHT - size) / 2);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

/** A sketch of a page in the theme: a line of text, a fainter one, a button. */
export async function drawTheme(colors: CoreThemeColors, wallpaper: string | undefined): Promise<Blob> {
  const tokens = deriveTokensFromCore(colors.background, colors.text, colors.primary);
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = hslStringToHex(tokens.background);
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  await drawWallpaper(ctx, wallpaper);

  const bar = (x: number, y: number, w: number, h: number, r: number, color: string, alpha: number) => {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = hslStringToHex(color);
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  };
  bar(32, 80, WIDTH * 0.45, 16, 8, tokens.foreground, 0.6);
  bar(32, 128, WIDTH * 0.3, 16, 8, tokens.mutedForeground, 0.4);
  bar(32, 168, 160, 36, 6, tokens.primary, 1);
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

export const LAYOUTS = ['horizontal', 'vertical', 'grid', 'star', 'checkerboard', 'diagonalStripes'] as const;
export type Layout = typeof LAYOUTS[number];


/** The palette laid out as Ditto lays it out, filling the image. */
export async function drawPalette(colors: string[], layout: Layout, emoji: string | undefined): Promise<Blob> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d')!;
  const n = colors.length;
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  };
  const polygon = (points: [number, number][], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };

  switch (layout) {
    case 'vertical':
      colors.forEach((c, i) => rect((i * WIDTH) / n, 0, WIDTH / n, HEIGHT, c));
      break;
    case 'grid': {
      const cols = n <= 3 ? n : n === 4 ? 2 : 3;
      const rows = Math.ceil(n / cols);
      colors.forEach((c, i) => rect(((i % cols) * WIDTH) / cols, (Math.floor(i / cols) * HEIGHT) / rows, WIDTH / cols, HEIGHT / rows, c));
      break;
    }
    case 'star': {
      // Slices from the centre, a little past the edges and overlapping, so
      // no seam shows.
      rect(0, 0, WIDTH, HEIGHT, colors[0]);
      colors.forEach((c, i) => {
        const start = (i * 360) / n - 90 - 0.5;
        const sweep = 360 / n + 1;
        const points: [number, number][] = [[WIDTH / 2, HEIGHT / 2]];
        for (let step = 0; step <= 12; step++) {
          const a = ((start + (sweep * step) / 12) * Math.PI) / 180;
          points.push([WIDTH / 2 + (WIDTH / 2) * 1.5 * Math.cos(a), HEIGHT / 2 + (HEIGHT / 2) * 1.5 * Math.sin(a)]);
        }
        polygon(points, c);
      });
      break;
    }
    case 'checkerboard': {
      const rows = n * Math.max(2, 4 - n);
      const cell = HEIGHT / rows;
      const cols = Math.ceil(WIDTH / cell);
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) rect(col * cell, row * cell, cell, cell, colors[(row + col) % n]);
      }
      break;
    }
    case 'diagonalStripes': {
      const stripe = (WIDTH + HEIGHT) / n;
      colors.forEach((c, i) => polygon([[i * stripe, 0], [(i + 1) * stripe, 0], [(i + 1) * stripe - HEIGHT, HEIGHT], [i * stripe - HEIGHT, HEIGHT]], c));
      break;
    }
    default:
      colors.forEach((c, i) => rect(0, (i * HEIGHT) / n, WIDTH, HEIGHT / n, c));
  }

  if (emoji) {
    ctx.font = '120px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, WIDTH / 2, HEIGHT / 2);
  }
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}

/** A theme's background image, as a cover at 40%. A video, or anything that won't load, is left out. */
async function drawWallpaper(ctx: OffscreenCanvasRenderingContext2D, url: string | undefined): Promise<void> {
  const bitmap = url ? await loadImage(url) : null;
  if (!bitmap) return;
  ctx.globalAlpha = 0.4;
  drawCover(ctx, bitmap, 0, 0, WIDTH, HEIGHT);
  ctx.globalAlpha = 1;
}

async function loadImage(url: string): Promise<ImageBitmap | null> {
  if (!url.startsWith('https://')) return null;
  try {
    const response = await fetch(url);
    return response.ok ? await createImageBitmap(await response.blob()) : null;
  } catch {
    return null;
  }
}

/** Draw an image to fill a box, cropping what overflows, centred. */
function drawCover(ctx: OffscreenCanvasRenderingContext2D, image: ImageBitmap, x: number, y: number, w: number, h: number): void {
  const scale = Math.max(w / image.width, h / image.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, w, h);
}
