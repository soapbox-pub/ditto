import { cors, Hono } from '@/deps.ts';

import { credentialsController } from './api/accounts.ts';
import { appCredentialsController, createAppController } from './api/apps.ts';
import { emptyArrayController, emptyObjectController } from './api/fallback.ts';
import instanceController from './api/instance.ts';
import { createTokenController } from './api/oauth.ts';
import { createStatusController } from './api/statuses.ts';

const app = new Hono();

app.use('/*', cors());

app.get('/api/v1/instance', instanceController);

app.get('/api/v1/apps/verify_credentials', appCredentialsController);
app.post('/api/v1/apps', createAppController);

app.post('/oauth/token', createTokenController);
app.post('/oauth/revoke', emptyObjectController);

app.get('/api/v1/accounts/verify_credentials', credentialsController);

app.post('/api/v1/statuses', createStatusController);

// Not (yet) implemented.
app.get('/api/v1/timelines/*', emptyArrayController);
app.get('/api/v1/notifications', emptyArrayController);
app.get('/api/v1/accounts/:id/statuses', emptyArrayController);
app.get('/api/v1/bookmarks', emptyArrayController);
app.get('/api/v1/custom_emojis', emptyArrayController);
app.get('/api/v1/accounts/search', emptyArrayController);
app.get('/api/v2/search', (c) => c.json({ accounts: [], statuses: [], hashtags: [] }));
app.get('/api/v1/filters', emptyArrayController);
app.get('/api/v1/blocks', emptyArrayController);
app.get('/api/v1/mutes', emptyArrayController);
app.get('/api/v1/domain_blocks', emptyArrayController);

export default app;
