import { createCanvas, loadImage } from '@gfx/canvas-wasm';
import TTLCache from '@isaacs/ttlcache';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { createAdminEvent } from '@/utils/api.ts';

interface Point {
  x: number;
  y: number;
}

interface Dimensions {
  w: number;
  h: number;
}

const captchas = new TTLCache<string, Point>();

/** Puzzle captcha controller. */
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

  const id = crypto.randomUUID();
  const now = new Date();
  const ttl = Conf.captchaTTL;

  captchas.set(id, solution, { ttl });

  return c.json({
    type: 'puzzle',
    id,
    puzzle: puzzle.toDataURL(),
    piece: piece.toDataURL(),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl).toISOString(),
  });
};

/** Generate a puzzle captcha, returning canvases for the board and piece. */
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

const pointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/** Verify the captcha solution and sign an event in the database. */
export const captchaVerifyController: AppController = async (c) => {
  const id = c.req.param('id');
  const result = pointSchema.safeParse(await c.req.json());
  const pubkey = await c.get('signer')!.getPublicKey();

  if (!result.success) {
    return c.json({ error: 'Invalid input' }, { status: 422 });
  }

  const solution = captchas.get(id);

  if (!solution) {
    return c.json({ error: 'Captcha expired' }, { status: 410 });
  }

  const dim = { w: 50, h: 50 };
  const point = result.data;

  const success = areIntersecting(
    { ...point, ...dim },
    { ...solution, ...dim },
  );

  if (success) {
    captchas.delete(id);

    await createAdminEvent({
      kind: 1985,
      tags: [
        ['L', 'pub.ditto.captcha'],
        ['l', 'solved', 'pub.ditto.captcha'],
        ['p', pubkey, Conf.relay],
      ],
    }, c);

    return new Response(null, { status: 204 });
  }

  return c.json({ error: 'Incorrect solution' }, { status: 400 });
};

type Rectangle = Point & Dimensions;

function areIntersecting(rect1: Rectangle, rect2: Rectangle, threshold = 0.5) {
  const r1cx = rect1.x + rect1.w / 2;
  const r2cx = rect2.x + rect2.w / 2;
  const r1cy = rect1.y + rect1.h / 2;
  const r2cy = rect2.y + rect2.h / 2;
  const dist = Math.sqrt((r2cx - r1cx) ** 2 + (r2cy - r1cy) ** 2);
  const e1 = Math.sqrt(rect1.h ** 2 + rect1.w ** 2) / 2;
  const e2 = Math.sqrt(rect2.h ** 2 + rect2.w ** 2) / 2;
  return dist < (e1 + e2) * threshold;
}
