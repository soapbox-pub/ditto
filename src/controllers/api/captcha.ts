import { createCanvas, loadImage } from '@gfx/canvas-wasm';
import { encodeBase64 } from '@std/encoding/base64';

import { AppController } from '@/app.ts';
import { DittoWallet } from '@/DittoWallet.ts';
import { aesEncrypt } from '@/utils/aes.ts';

export const captchaController: AppController = async (c) => {
  const { puzzle, piece, solution } = await generateCaptcha(
    await Deno.readFile(new URL('../../../captcha/tj-holowaychuk.jpg', import.meta.url)),
    await Deno.readFile(new URL('../../../captcha/puzzle.png', import.meta.url)),
    {
      cw: 300,
      ch: 300,
      pw: 50,
      ph: 50,
      alpha: 0.8,
    },
  );

  const answerData = {
    solution,
    created_at: new Date().toISOString(),
  };

  const encoded = new TextEncoder().encode(JSON.stringify(answerData));
  const encrypted = await aesEncrypt(DittoWallet.captchaKey, encoded);

  return c.json({
    type: 'puzzle',
    token: crypto.randomUUID(), // Useless, but Pleroma does it.
    puzzle: puzzle.toDataURL(),
    piece: piece.toDataURL(),
    answer_data: encodeBase64(encrypted),
  });
};

interface Point {
  x: number;
  y: number;
}

async function generateCaptcha(
  from: Uint8Array,
  mask: Uint8Array,
  opts: {
    pw: number;
    ph: number;
    cw: number;
    ch: number;
    alpha: number;
  },
) {
  const { pw, ph, cw, ch, alpha } = opts;
  const puzzle = createCanvas(cw, ch);
  const ctx = puzzle.getContext('2d');
  const image = await loadImage(from);
  ctx.drawImage(image, 0, 0, image.width(), image.height(), 0, 0, cw, ch);

  const piece = createCanvas(pw, ph);
  const pctx = piece.getContext('2d');

  const solution = getPieceCoords(puzzle.width, puzzle.height, pw, ph);

  // Draw the piece onto the puzzle piece canvas but only where the mask allows
  const maskImage = await loadImage(mask);
  pctx.globalCompositeOperation = 'source-over';
  pctx.drawImage(maskImage, 0, 0, pw, ph);
  pctx.globalCompositeOperation = 'source-in';
  pctx.drawImage(puzzle, solution.x, solution.y, pw, ph, 0, 0, pw, ph);

  // Reset composite operation
  pctx.globalCompositeOperation = 'source-over';

  // Create a temporary canvas to draw the darkened shape
  const tempCanvas = createCanvas(pw, ph);
  const tempCtx = tempCanvas.getContext('2d');

  // Draw the darkened shape onto the temporary canvas but only where the mask allows
  tempCtx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  tempCtx.fillRect(0, 0, pw, ph);
  tempCtx.globalCompositeOperation = 'destination-in';
  tempCtx.drawImage(maskImage, 0, 0, pw, ph);

  // Draw the temporary canvas onto the puzzle at the piece's location
  ctx.drawImage(tempCanvas, solution.x, solution.y, pw, ph);

  return {
    puzzle,
    piece,
    solution,
  };
}

function getPieceCoords(cw: number, ch: number, pw: number, ph: number): Point {
  // Random x coordinate such that the piece fits within the canvas horizontally
  const x = Math.floor(Math.random() * (cw - pw));

  // Random y coordinate such that the piece fits within the canvas vertically
  const y = Math.floor(Math.random() * (ch - ph));

  return { x, y };
}
