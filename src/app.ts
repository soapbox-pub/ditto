import {
  type Context,
  cors,
  type Event,
  type Handler,
  Hono,
  type HonoEnv,
  logger,
  type MiddlewareHandler,
} from '@/deps.ts';
import '@/firehose.ts';

import { actorController } from './controllers/activitypub/actor.ts';
import {
  accountController,
  accountLookupController,
  accountSearchController,
  accountStatusesController,
  createAccountController,
  followController,
  relationshipsController,
  updateCredentialsController,
  verifyCredentialsController,
} from './controllers/api/accounts.ts';
import { appCredentialsController, createAppController } from './controllers/api/apps.ts';
import { emptyArrayController, emptyObjectController } from './controllers/api/fallback.ts';
import { instanceController } from './controllers/api/instance.ts';
import { notificationsController } from './controllers/api/notifications.ts';
import { createTokenController, oauthAuthorizeController, oauthController } from './controllers/api/oauth.ts';
import { frontendConfigController } from './controllers/api/pleroma.ts';
import { preferencesController } from './controllers/api/preferences.ts';
import { relayController } from './controllers/nostr/relay.ts';
import { searchController } from './controllers/api/search.ts';
import {
  contextController,
  createStatusController,
  favouriteController,
  statusController,
} from './controllers/api/statuses.ts';
import { streamingController } from './controllers/api/streaming.ts';
import { homeController, publicController } from './controllers/api/timelines.ts';
import { trendingTagsController } from './controllers/api/trends.ts';
import { indexController } from './controllers/site.ts';
import { hostMetaController } from './controllers/well-known/host-meta.ts';
import { nodeInfoController, nodeInfoSchemaController } from './controllers/well-known/nodeinfo.ts';
import { nostrController } from './controllers/well-known/nostr.ts';
import { webfingerController } from './controllers/well-known/webfinger.ts';
import { auth19, requireAuth } from './middleware/auth19.ts';
import { auth98 } from './middleware/auth98.ts';

interface AppEnv extends HonoEnv {
  Variables: {
    /** Hex pubkey for the current user. If provided, the user is considered "logged in." */
    pubkey?: string;
    /** Hex secret key for the current user. Optional, but easiest way to use legacy Mastodon apps. */
    seckey?: string;
    /** NIP-98 signed event proving the pubkey is owned by the user. */
    proof?: Event<27235>;
  };
}

type AppContext = Context<AppEnv>;
type AppMiddleware = MiddlewareHandler<AppEnv>;
type AppController = Handler<AppEnv>;

const app = new Hono<AppEnv>();

app.use('*', logger());

app.get('/api/v1/streaming', streamingController);
app.get('/api/v1/streaming/', streamingController);
app.get('/relay', relayController);

app.use('*', cors({ origin: '*', exposeHeaders: ['link'] }), auth19, auth98());

app.get('/.well-known/webfinger', webfingerController);
app.get('/.well-known/host-meta', hostMetaController);
app.get('/.well-known/nodeinfo', nodeInfoController);
app.get('/.well-known/nostr.json', nostrController);

app.get('/users/:username', actorController);

app.get('/nodeinfo/:version', nodeInfoSchemaController);

app.get('/api/v1/instance', instanceController);

app.get('/api/v1/apps/verify_credentials', appCredentialsController);
app.post('/api/v1/apps', createAppController);

app.post('/oauth/token', createTokenController);
app.post('/oauth/revoke', emptyObjectController);
app.post('/oauth/authorize', oauthAuthorizeController);
app.get('/oauth/authorize', oauthController);

app.post('/api/v1/acccounts', createAccountController);
app.get('/api/v1/accounts/verify_credentials', requireAuth, verifyCredentialsController);
app.patch('/api/v1/accounts/update_credentials', requireAuth, updateCredentialsController);
app.get('/api/v1/accounts/search', accountSearchController);
app.get('/api/v1/accounts/lookup', accountLookupController);
app.get('/api/v1/accounts/relationships', relationshipsController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/follow', followController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/statuses', accountStatusesController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}', accountController);

app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/context', contextController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}', statusController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/favourite', favouriteController);
app.post('/api/v1/statuses', requireAuth, createStatusController);

app.get('/api/v1/timelines/home', requireAuth, homeController);
app.get('/api/v1/timelines/public', publicController);

app.get('/api/v1/preferences', preferencesController);
app.get('/api/v1/search', searchController);
app.get('/api/v2/search', searchController);

app.get('/api/pleroma/frontend_configurations', frontendConfigController);

app.get('/api/v1/trends/tags', trendingTagsController);
app.get('/api/v1/trends', trendingTagsController);

app.get('/api/v1/notifications', notificationsController);

// Not (yet) implemented.
app.get('/api/v1/bookmarks', emptyArrayController);
app.get('/api/v1/custom_emojis', emptyArrayController);
app.get('/api/v1/accounts/search', emptyArrayController);
app.get('/api/v1/filters', emptyArrayController);
app.get('/api/v1/blocks', emptyArrayController);
app.get('/api/v1/mutes', emptyArrayController);
app.get('/api/v1/domain_blocks', emptyArrayController);
app.get('/api/v1/markers', emptyObjectController);
app.get('/api/v1/conversations', emptyArrayController);
app.get('/api/v1/favourites', emptyArrayController);
app.get('/api/v1/lists', emptyArrayController);

app.get('/', indexController);

export default app;

export type { AppContext, AppController, AppMiddleware };
