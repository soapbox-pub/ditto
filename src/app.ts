import { Hono } from '@/deps.ts';

const app = new Hono();

app.get('/', (c) => c.text('Hono!'));

export default app;
