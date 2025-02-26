import { createCanvas } from '@gfx/canvas-wasm';
import { assertNotEquals } from '@std/assert';
import { encodeHex } from '@std/encoding/hex';

import { addNoise } from './canvas.ts';

// This is almost impossible to truly test,
// but we can at least check that the image on the canvas changes.
Deno.test('addNoise', async () => {
  const canvas = createCanvas(100, 100);
  const ctx = canvas.getContext('2d');

  const dataBefore = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hashBefore = await crypto.subtle.digest('SHA-256', dataBefore.data);

  addNoise(ctx, canvas.width, canvas.height);

  const dataAfter = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hashAfter = await crypto.subtle.digest('SHA-256', dataAfter.data);

  assertNotEquals(encodeHex(hashBefore), encodeHex(hashAfter));
});
