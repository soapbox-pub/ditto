import { Conf } from '@/config.ts';
import '@/cron.ts';
import { type User } from '@/db/users.ts';
import {
  type Context,
  cors,
  Debug,
  type Event,
  type Handler,
  Hono,
  type HonoEnv,
  logger,
  type MiddlewareHandler,
  sentryMiddleware,
  serveStatic,
} from '@/deps.ts';
import '@/firehose.ts';
import { Time } from '@/utils.ts';

import { actorController } from './controllers/activitypub/actor.ts';
import {
  accountController,
  accountLookupController,
  accountSearchController,
  accountStatusesController,
  blockController,
  createAccountController,
  favouritesController,
  followController,
  followersController,
  followingController,
  relationshipsController,
  unblockController,
  unfollowController,
  updateCredentialsController,
  verifyCredentialsController,
} from './controllers/api/accounts.ts';
import { appCredentialsController, createAppController } from './controllers/api/apps.ts';
import { blocksController } from './controllers/api/blocks.ts';
import { bookmarksController } from './controllers/api/bookmarks.ts';
import { emptyArrayController, emptyObjectController, notImplementedController } from './controllers/api/fallback.ts';
import { instanceController } from './controllers/api/instance.ts';
import { mediaController } from './controllers/api/media.ts';
import { notificationsController } from './controllers/api/notifications.ts';
import { createTokenController, oauthAuthorizeController, oauthController } from './controllers/api/oauth.ts';
import { frontendConfigController, updateConfigController } from './controllers/api/pleroma.ts';
import { preferencesController } from './controllers/api/preferences.ts';
import { relayController } from './controllers/nostr/relay.ts';
import { searchController } from './controllers/api/search.ts';
import {
  bookmarkController,
  contextController,
  createStatusController,
  favouriteController,
  favouritedByController,
  rebloggedByController,
  statusController,
} from './controllers/api/statuses.ts';
import { streamingController } from './controllers/api/streaming.ts';
import {
  hashtagTimelineController,
  homeTimelineController,
  publicTimelineController,
} from './controllers/api/timelines.ts';
import { trendingTagsController } from './controllers/api/trends.ts';
import { indexController } from './controllers/site.ts';
import { hostMetaController } from './controllers/well-known/host-meta.ts';
import { nodeInfoController, nodeInfoSchemaController } from './controllers/well-known/nodeinfo.ts';
import { nostrController } from './controllers/well-known/nostr.ts';
import { webfingerController } from './controllers/well-known/webfinger.ts';
import { auth19, requirePubkey } from './middleware/auth19.ts';
import { auth98, requireProof, requireRole } from './middleware/auth98.ts';
import { cache } from './middleware/cache.ts';
import { csp } from './middleware/csp.ts';

interface AppEnv extends HonoEnv {
  Variables: {
    /** Hex pubkey for the current user. If provided, the user is considered "logged in." */
    pubkey?: string;
    /** Hex secret key for the current user. Optional, but easiest way to use legacy Mastodon apps. */
    seckey?: string;
    /** NIP-98 signed event proving the pubkey is owned by the user. */
    proof?: Event<27235>;
    /** User associated with the pubkey, if any. */
    user?: User;
  };
}

type AppContext = Context<AppEnv>;
type AppMiddleware = MiddlewareHandler<AppEnv>;
type AppController = Handler<AppEnv>;

const app = new Hono<AppEnv>();

if (Conf.sentryDsn) {
  // @ts-ignore Mismatched hono types.
  app.use('*', sentryMiddleware({ dsn: Conf.sentryDsn }));
}

const debug = Debug('ditto:http');

app.use('/api/*', logger(debug));
app.use('/relay/*', logger(debug));
app.use('/.well-known/*', logger(debug));
app.use('/users/*', logger(debug));
app.use('/nodeinfo/*', logger(debug));
app.use('/oauth/*', logger(debug));

app.get('/api/v1/streaming', streamingController);
app.get('/api/v1/streaming/', streamingController);
app.get('/relay', relayController);

app.use('*', csp(), cors({ origin: '*', exposeHeaders: ['link'] }), auth19, auth98());

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

app.post('/api/v1/accounts', requireProof({ pow: 20 }), createAccountController);
app.get('/api/v1/accounts/verify_credentials', requirePubkey, verifyCredentialsController);
app.patch(
  '/api/v1/accounts/update_credentials',
  requireRole('user', { validatePayload: false }),
  updateCredentialsController,
);
app.get('/api/v1/accounts/search', accountSearchController);
app.get('/api/v1/accounts/lookup', accountLookupController);
app.get('/api/v1/accounts/relationships', relationshipsController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/block', requirePubkey, blockController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unblock', requirePubkey, unblockController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/follow', requirePubkey, followController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unfollow', requirePubkey, unfollowController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/followers', followersController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/following', followingController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/statuses', accountStatusesController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}', accountController);

app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/favourited_by', favouritedByController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/reblogged_by', rebloggedByController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/context', contextController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}', statusController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/favourite', requirePubkey, favouriteController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/bookmark', requirePubkey, bookmarkController);
app.post('/api/v1/statuses', requirePubkey, createStatusController);

app.post('/api/v1/media', requireRole('user', { validatePayload: false }), mediaController);
app.post('/api/v2/media', requireRole('user', { validatePayload: false }), mediaController);

app.get('/api/v1/timelines/home', requirePubkey, homeTimelineController);
app.get('/api/v1/timelines/public', publicTimelineController);
app.get('/api/v1/timelines/tag/:hashtag', hashtagTimelineController);

app.get('/api/v1/preferences', preferencesController);
app.get('/api/v1/search', searchController);
app.get('/api/v2/search', searchController);

app.get('/api/pleroma/frontend_configurations', frontendConfigController);

app.get('/api/v1/trends/tags', cache({ cacheName: 'web', expires: Time.minutes(15) }), trendingTagsController);
app.get('/api/v1/trends', cache({ cacheName: 'web', expires: Time.minutes(15) }), trendingTagsController);

app.get('/api/v1/notifications', requirePubkey, notificationsController);
app.get('/api/v1/favourites', requirePubkey, favouritesController);
app.get('/api/v1/bookmarks', requirePubkey, bookmarksController);
app.get('/api/v1/blocks', requirePubkey, blocksController);

app.post('/api/v1/pleroma/admin/config', requireRole('admin'), updateConfigController);

// Not (yet) implemented.
app.get('/api/v1/custom_emojis', emptyArrayController);
app.get('/api/v1/filters', emptyArrayController);
app.get('/api/v1/mutes', emptyArrayController);
app.get('/api/v1/domain_blocks', emptyArrayController);
app.get('/api/v1/markers', emptyObjectController);
app.get('/api/v1/conversations', emptyArrayController);
app.get('/api/v1/lists', emptyArrayController);

app.use('/api/*', notImplementedController);

app.get('*', serveStatic({ root: './public/' }));
app.get('*', serveStatic({ root: './static/' }));
app.get('*', serveStatic({ path: './public/index.html' }));

app.get('/', indexController);

export default app;

export type { AppContext, AppController, AppMiddleware };
