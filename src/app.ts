import { Hono } from '@/deps.ts';
import { appVerifyCredentials, createAppController } from './api/apps.ts';

import instanceController from './api/instance.ts';

const app = new Hono();

app.get('/api/v1/instance', instanceController);

app.get('/api/v1/apps/verify_credentials', appVerifyCredentials);
app.post('/api/v1/apps', createAppController);

export default app;
