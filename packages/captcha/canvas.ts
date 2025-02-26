import type { CanvasRenderingContext2D } from '@gfx/canvas-wasm';

/**
 * Add a small amount of noise to the image.
 * This protects against an attacker pregenerating every possible solution and then doing a reverse-lookup.
 */
export function addNoise(ctx: CanvasRenderingContext2D, width: number, height: number): void {
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
