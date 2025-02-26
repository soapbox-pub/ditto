import {
  type CanvasRenderingContext2D,
  createCanvas,
  type EmulatedCanvas2D,
  type Image,
  loadImage,
} from '@gfx/canvas-wasm';

export interface CaptchaImages {
  bgImages: Image[];
  puzzleMask: Image;
  puzzleHole: Image;
}

interface Point {
  x: number;
  y: number;
}

interface Dimensions {
  w: number;
  h: number;
}

type Rectangle = Point & Dimensions;

export async function getCaptchaImages(): Promise<CaptchaImages> {
  const bgImages = await getBackgroundImages();

  const puzzleMask = await loadImage(
    await Deno.readFile(new URL('./assets/puzzle/puzzle-mask.png', import.meta.url)),
  );
  const puzzleHole = await loadImage(
    await Deno.readFile(new URL('./assets/puzzle/puzzle-hole.png', import.meta.url)),
  );

  return { bgImages, puzzleMask, puzzleHole };
}

async function getBackgroundImages(): Promise<Image[]> {
  const path = new URL('./assets/bg/', import.meta.url);

  const images: Image[] = [];

  for await (const dirEntry of Deno.readDir(path)) {
    if (dirEntry.isFile && dirEntry.name.endsWith('.jpg')) {
      const file = await Deno.readFile(new URL(dirEntry.name, path));
      const image = await loadImage(file);
      images.push(image);
    }
  }

  return images;
}

/** Generate a puzzle captcha, returning canvases for the board and piece. */
export function generateCaptcha(
  { bgImages, puzzleMask, puzzleHole }: CaptchaImages,
  bgSize: Dimensions,
  puzzleSize: Dimensions,
): {
  bg: EmulatedCanvas2D;
  puzzle: EmulatedCanvas2D;
  solution: Point;
} {
  const bg = createCanvas(bgSize.w, bgSize.h);
  const puzzle = createCanvas(puzzleSize.w, puzzleSize.h);

  const ctx = bg.getContext('2d');
  const pctx = puzzle.getContext('2d');

  const solution = generateSolution(bgSize, puzzleSize);
  const bgImage = bgImages[Math.floor(Math.random() * bgImages.length)];

  // Draw the background image.
  ctx.drawImage(bgImage, 0, 0, bg.width, bg.height);
  addNoise(ctx, bg.width, bg.height);

  // Draw the puzzle piece.
  pctx.drawImage(puzzleMask, 0, 0, puzzle.width, puzzle.height);
  pctx.globalCompositeOperation = 'source-in';
  pctx.drawImage(bg, solution.x, solution.y, puzzle.width, puzzle.height, 0, 0, puzzle.width, puzzle.height);

  // Draw the hole.
  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(puzzleHole, solution.x, solution.y, puzzle.width, puzzle.height);

  return {
    bg,
    puzzle,
    solution,
  };
}

/**
 * Add a small amount of noise to the image.
 * This protects against an attacker pregenerating every possible solution and then doing a reverse-lookup.
 */
function addNoise(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const imageData = ctx.getImageData(0, 0, width, height);

  // Loop over every pixel.
  for (let i = 0; i < imageData.data.length; i += 4) {
    // Add/subtract a small amount from each color channel.
    // We skip i+3 because that's the alpha channel, which we don't want to modify.
    for (let j = 0; j < 3; j++) {
      const alteration = Math.floor(Math.random() * 11) - 5; // Vary between -5 and +5
      imageData.data[i + j] = Math.min(Math.max(imageData.data[i + j] + alteration, 0), 255);
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

export function verifyCaptchaSolution(puzzleSize: Dimensions, point: Point, solution: Point): boolean {
  return areIntersecting(
    { ...point, ...puzzleSize },
    { ...solution, ...puzzleSize },
  );
}

function areIntersecting(rect1: Rectangle, rect2: Rectangle, threshold = 0.5): boolean {
  const r1cx = rect1.x + rect1.w / 2;
  const r2cx = rect2.x + rect2.w / 2;
  const r1cy = rect1.y + rect1.h / 2;
  const r2cy = rect2.y + rect2.h / 2;
  const dist = Math.sqrt((r2cx - r1cx) ** 2 + (r2cy - r1cy) ** 2);
  const e1 = Math.sqrt(rect1.h ** 2 + rect1.w ** 2) / 2;
  const e2 = Math.sqrt(rect2.h ** 2 + rect2.w ** 2) / 2;
  return dist < (e1 + e2) * threshold;
}

/** Random coordinates such that the piece fits within the canvas. */
function generateSolution(bgSize: Dimensions, puzzleSize: Dimensions): Point {
  return {
    x: Math.floor(Math.random() * (bgSize.w - puzzleSize.w)),
    y: Math.floor(Math.random() * (bgSize.h - puzzleSize.h)),
  };
}
