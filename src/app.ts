import { type Context, cors, type Handler, Hono, type HonoEnv, logger, type MiddlewareHandler } from '@/deps.ts';

import {
  accountController,
  accountLookupController,
  accountSearchController,
  credentialsController,
  relationshipsController,
} from './controllers/api/accounts.ts';
import { appCredentialsController, createAppController } from './controllers/api/apps.ts';
import { emptyArrayController, emptyObjectController } from './controllers/api/fallback.ts';
import { homeController } from './controllers/api/timelines.ts';
import instanceController from './controllers/api/instance.ts';
import { createTokenController, oauthAuthorizeController, oauthController } from './controllers/api/oauth.ts';
import { contextController, createStatusController, statusController } from './controllers/api/statuses.ts';
import { requireAuth, setAuth } from './middleware/auth.ts';
import { indexController } from './controllers/site.ts';

interface AppEnv extends HonoEnv {
  Variables: {
    pubkey?: string;
    seckey?: string;
  };
}

type AppContext = Context<AppEnv>;
type AppMiddleware = MiddlewareHandler<AppEnv>;
type AppController = Handler<AppEnv>;

const app = new Hono<AppEnv>();

app.use('/*', logger(), cors({ origin: '*', exposeHeaders: ['link'] }), setAuth);

app.get('/api/v1/instance', instanceController);

app.get('/api/v1/apps/verify_credentials', appCredentialsController);
app.post('/api/v1/apps', createAppController);

app.post('/oauth/token', createTokenController);
app.post('/oauth/revoke', emptyObjectController);
app.post('/oauth/authorize', oauthAuthorizeController);
app.get('/oauth/authorize', oauthController);

app.get('/api/v1/accounts/verify_credentials', requireAuth, credentialsController);
app.get('/api/v1/accounts/search', accountSearchController);
app.get('/api/v1/accounts/lookup', accountLookupController);
app.get('/api/v1/accounts/relationships', relationshipsController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}', accountController);

app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/context', contextController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}', statusController);
app.post('/api/v1/statuses', requireAuth, createStatusController);

app.get('/api/v1/timelines/home', requireAuth, homeController);

// Not (yet) implemented.
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
app.get('/api/v1/markers', emptyObjectController);

app.get('/', indexController);

export default app;

export type { AppContext, AppController, AppMiddleware };
