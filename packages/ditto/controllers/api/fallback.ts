import { Handler } from '@hono/hono';

const emptyArrayController: Handler = (c) => {
  c.header('Cache-Control', 'max-age=300, public, stale-while-revalidate=60');
  return c.json([]);
};

const notImplementedController: Handler = (c) => {
  c.header('Cache-Control', 'max-age=300, public, stale-while-revalidate=60');
  return c.json({ error: 'Not implemented' }, 404);
};

export { emptyArrayController, notImplementedController };
