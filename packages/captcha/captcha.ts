import { createCanvas, type EmulatedCanvas2D } from '@gfx/canvas-wasm';

import { addNoise } from './canvas.ts';
import { areIntersecting, type Dimensions, type Point } from './geometry.ts';

import type { CaptchaImages } from './assets.ts';

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

export function verifyCaptchaSolution(puzzleSize: Dimensions, point: Point, solution: Point): boolean {
  return areIntersecting(
    { ...point, ...puzzleSize },
    { ...solution, ...puzzleSize },
  );
}

/** Random coordinates such that the piece fits within the canvas. */
function generateSolution(bgSize: Dimensions, puzzleSize: Dimensions): Point {
  return {
    x: Math.floor(Math.random() * (bgSize.w - puzzleSize.w)),
    y: Math.floor(Math.random() * (bgSize.h - puzzleSize.h)),
  };
}
