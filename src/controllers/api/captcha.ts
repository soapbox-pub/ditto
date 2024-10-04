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
  const { bg, puzzle, solution } = await generateCaptcha(
    await Deno.readFile(new URL('../../../captcha/tj-holowaychuk.jpg', import.meta.url)),
    await Deno.readFile(new URL('../../../captcha/puzzle-mask.png', import.meta.url)),
    await Deno.readFile(new URL('../../../captcha/puzzle-hole.png', import.meta.url)),
    {
      cw: 370,
      ch: 400,
      pw: 65,
      ph: 65,
    },
  );

  const id = crypto.randomUUID();
  const now = new Date();
  const ttl = Conf.captchaTTL;

  captchas.set(id, solution, { ttl });

  return c.json({
    id,
    type: 'puzzle',
    bg: bg.toDataURL(),
    puzzle: puzzle.toDataURL(),
    created_at: now.toISOString(),
    expires_at: new Date(now.getTime() + ttl).toISOString(),
  });
};

/** Generate a puzzle captcha, returning canvases for the board and piece. */
async function generateCaptcha(
  from: Uint8Array,
  mask: Uint8Array,
  hole: Uint8Array,
  opts: {
    pw: number;
    ph: number;
    cw: number;
    ch: number;
  },
) {
  const { pw, ph, cw, ch } = opts;
  const bg = createCanvas(cw, ch);
  const ctx = bg.getContext('2d');
  const image = await loadImage(from);
  ctx.drawImage(image, 0, 0, image.width(), image.height(), 0, 0, cw, ch);

  const puzzle = createCanvas(pw, ph);
  const pctx = puzzle.getContext('2d');

  const solution = getPieceCoords(bg.width, bg.height, pw, ph);

  const maskImage = await loadImage(mask);
  const holeImage = await loadImage(hole);

  pctx.drawImage(maskImage, 0, 0, pw, ph);
  pctx.globalCompositeOperation = 'source-in';
  pctx.drawImage(bg, solution.x, solution.y, pw, ph, 0, 0, pw, ph);

  ctx.globalCompositeOperation = 'source-atop';
  ctx.drawImage(holeImage, solution.x, solution.y, pw, ph);

  return {
    bg,
    puzzle,
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

  const dim = { w: 65, h: 65 };
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
