import { generateCaptcha, getCaptchaImages, verifyCaptchaSolution } from '@ditto/captcha';
import TTLCache from '@isaacs/ttlcache';
import { z } from 'zod';

import { AppController } from '@/app.ts';
import { updateUser } from '@/utils/api.ts';

interface Point {
  x: number;
  y: number;
}

const pointSchema: z.ZodType<Point> = z.object({
  x: z.number(),
  y: z.number(),
});

const captchas = new TTLCache<string, Point>();
const imagesAsync = getCaptchaImages();

const BG_SIZE = { w: 370, h: 400 };
const PUZZLE_SIZE = { w: 65, h: 65 };

/** Puzzle captcha controller. */
export const captchaController: AppController = async (c) => {
  const { conf } = c.var;

  const { bg, puzzle, solution } = generateCaptcha(
    await imagesAsync,
    BG_SIZE,
    PUZZLE_SIZE,
  );

  const id = crypto.randomUUID();
  const now = new Date();
  const ttl = conf.captchaTTL;

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

/** Verify the captcha solution and sign an event in the database. */
export const captchaVerifyController: AppController = async (c) => {
  const { user } = c.var;

  const id = c.req.param('id');
  const result = pointSchema.safeParse(await c.req.json());
  const pubkey = await user!.signer.getPublicKey();

  if (!result.success) {
    return c.json({ error: 'Invalid input' }, { status: 422 });
  }

  const solution = captchas.get(id);

  if (!solution) {
    return c.json({ error: 'Captcha expired' }, { status: 410 });
  }

  const solved = verifyCaptchaSolution(PUZZLE_SIZE, result.data, solution);

  if (solved) {
    captchas.delete(id);
    await updateUser(pubkey, { captcha_solved: true }, c);
    return c.newResponse(null, { status: 204 });
  }

  return c.json({ error: 'Incorrect solution' }, { status: 400 });
};
