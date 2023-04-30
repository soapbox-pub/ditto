import type { Context } from '@/deps.ts';

const emptyArrayController = (c: Context) => c.json([]);
const emptyObjectController = (c: Context) => c.json({});

export { emptyArrayController, emptyObjectController };
