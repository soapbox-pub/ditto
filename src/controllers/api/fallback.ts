import type { Context } from '@/deps.ts';

const emptyArrayController = (c: Context) => c.json([]);
const emptyObjectController = (c: Context) => c.json({});
const notImplementedController = (c: Context) => Promise.resolve(c.json({ error: 'Not implemented' }, 404));

export { emptyArrayController, emptyObjectController, notImplementedController };
