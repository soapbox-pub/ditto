import { Context } from '@hono/hono';

const emptyArrayController = (c: Context) => c.json([]);
const notImplementedController = (c: Context) => Promise.resolve(c.json({ error: 'Not implemented' }, 404));

export { emptyArrayController, notImplementedController };
