import { createCanvas, loadImage } from '@gfx/canvas-wasm';
import { encodeBase64 } from '@std/encoding/base64';

import { AppController } from '@/app.ts';
import { DittoWallet } from '@/DittoWallet.ts';
import { aesEncrypt } from '@/utils/aes.ts';

export const captchaController: AppController = async (c) => {
  const { puzzle, piece, solution } = await generateCaptcha(
    await Deno.readFile(new URL('../../../captcha/tj-holowaychuk.jpg', import.meta.url)),
    {
      cw: 300,
      ch: 300,
      pw: 50,
      ph: 50,
      alpha: 0.6,
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
    token: crypto.randomUUID(),
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
  pctx.drawImage(puzzle, solution.x, solution.y, pw, ph, 0, 0, pw, ph);
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(solution.x, solution.y, pw, ph);

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
