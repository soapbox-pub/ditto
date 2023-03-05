import { Hono } from '@/deps.ts';

import instanceController from './api/instance.ts';

const app = new Hono();

app.get('/api/v1/instance', instanceController);

export default app;
