import { Context, Env as HonoEnv, Handler, Hono, Input as HonoInput, MiddlewareHandler } from '@hono/hono';
import { cors } from '@hono/hono/cors';
import { serveStatic } from '@hono/hono/deno';
import { logger } from '@hono/hono/logger';
import { NostrEvent, NostrSigner, NStore, NUploader } from '@nostrify/nostrify';
import Debug from '@soapbox/stickynotes/debug';

import { Conf } from '@/config.ts';
import { cron } from '@/cron.ts';
import { startFirehose } from '@/firehose.ts';
import { Time } from '@/utils/time.ts';

import {
  accountController,
  accountLookupController,
  accountSearchController,
  accountStatusesController,
  blockController,
  createAccountController,
  familiarFollowersController,
  favouritesController,
  followController,
  followersController,
  followingController,
  muteController,
  relationshipsController,
  unblockController,
  unfollowController,
  unmuteController,
  updateCredentialsController,
  verifyCredentialsController,
} from '@/controllers/api/accounts.ts';
import {
  adminAccountsController,
  adminActionController,
  adminApproveController,
  adminRejectController,
} from '@/controllers/api/admin.ts';
import { appCredentialsController, createAppController } from '@/controllers/api/apps.ts';
import { blocksController } from '@/controllers/api/blocks.ts';
import { bookmarksController } from '@/controllers/api/bookmarks.ts';
import {
  adminRelaysController,
  adminSetRelaysController,
  nameRequestController,
  nameRequestsController,
} from '@/controllers/api/ditto.ts';
import { emptyArrayController, emptyObjectController, notImplementedController } from '@/controllers/api/fallback.ts';
import {
  instanceDescriptionController,
  instanceV1Controller,
  instanceV2Controller,
} from '@/controllers/api/instance.ts';
import { markersController, updateMarkersController } from '@/controllers/api/markers.ts';
import { mediaController } from '@/controllers/api/media.ts';
import { mutesController } from '@/controllers/api/mutes.ts';
import { notificationsController } from '@/controllers/api/notifications.ts';
import { createTokenController, oauthAuthorizeController, oauthController } from '@/controllers/api/oauth.ts';
import {
  configController,
  frontendConfigController,
  pleromaAdminDeleteStatusController,
  pleromaAdminSuggestController,
  pleromaAdminTagController,
  pleromaAdminUnsuggestController,
  pleromaAdminUntagController,
  updateConfigController,
} from '@/controllers/api/pleroma.ts';
import { preferencesController } from '@/controllers/api/preferences.ts';
import { deleteReactionController, reactionController, reactionsController } from '@/controllers/api/reactions.ts';
import { relayController } from '@/controllers/nostr/relay.ts';
import {
  adminReportController,
  adminReportReopenController,
  adminReportResolveController,
  adminReportsController,
  reportController,
} from '@/controllers/api/reports.ts';
import { searchController } from '@/controllers/api/search.ts';
import {
  bookmarkController,
  contextController,
  createStatusController,
  deleteStatusController,
  favouriteController,
  favouritedByController,
  pinController,
  quotesController,
  rebloggedByController,
  reblogStatusController,
  statusController,
  unbookmarkController,
  unpinController,
  unreblogStatusController,
  zapController,
  zappedByController,
} from '@/controllers/api/statuses.ts';
import { streamingController } from '@/controllers/api/streaming.ts';
import { suggestionsV1Controller, suggestionsV2Controller } from '@/controllers/api/suggestions.ts';
import {
  hashtagTimelineController,
  homeTimelineController,
  publicTimelineController,
  suggestedTimelineController,
} from '@/controllers/api/timelines.ts';
import {
  trendingLinksController,
  trendingStatusesController,
  trendingTagsController,
} from '@/controllers/api/trends.ts';
import { metricsController } from '@/controllers/metrics.ts';
import { indexController } from '@/controllers/site.ts';
import { nodeInfoController, nodeInfoSchemaController } from '@/controllers/well-known/nodeinfo.ts';
import { nostrController } from '@/controllers/well-known/nostr.ts';
import { auth98Middleware, requireProof, requireRole } from '@/middleware/auth98Middleware.ts';
import { cspMiddleware } from '@/middleware/cspMiddleware.ts';
import { metricsMiddleware } from '@/middleware/metricsMiddleware.ts';
import { rateLimitMiddleware } from '@/middleware/rateLimitMiddleware.ts';
import { requireSigner } from '@/middleware/requireSigner.ts';
import { signerMiddleware } from '@/middleware/signerMiddleware.ts';
import { storeMiddleware } from '@/middleware/storeMiddleware.ts';
import { uploaderMiddleware } from '@/middleware/uploaderMiddleware.ts';

interface AppEnv extends HonoEnv {
  Variables: {
    /** Signer to get the logged-in user's pubkey, relays, and to sign events, or `undefined` if the user isn't logged in. */
    signer?: NostrSigner;
    /** Uploader for the user to upload files. */
    uploader?: NUploader;
    /** NIP-98 signed event proving the pubkey is owned by the user. */
    proof?: NostrEvent;
    /** Store */
    store: NStore;
  };
}

type AppContext = Context<AppEnv>;
type AppMiddleware = MiddlewareHandler<AppEnv>;
type AppController = Handler<AppEnv, any, HonoInput, Response | Promise<Response>>;

const app = new Hono<AppEnv>({ strict: false });

const debug = Debug('ditto:http');

if (Conf.firehoseEnabled) {
  startFirehose();
}
if (Conf.cronEnabled) {
  cron();
}

app.use('*', rateLimitMiddleware(300, Time.minutes(5)));

app.use('/api/*', logger(debug));
app.use('/.well-known/*', logger(debug));
app.use('/users/*', logger(debug));
app.use('/nodeinfo/*', logger(debug));
app.use('/oauth/*', logger(debug));

app.get('/api/v1/streaming', streamingController);
app.get('/relay', relayController);

app.use(
  '*',
  metricsMiddleware,
  cspMiddleware(),
  cors({ origin: '*', exposeHeaders: ['link'] }),
  signerMiddleware,
  uploaderMiddleware,
  auth98Middleware(),
  storeMiddleware,
);

app.get('/metrics', metricsController);

app.get('/.well-known/nodeinfo', nodeInfoController);
app.get('/.well-known/nostr.json', nostrController);

app.get('/nodeinfo/:version', nodeInfoSchemaController);

app.get('/api/v1/instance', instanceV1Controller);
app.get('/api/v2/instance', instanceV2Controller);
app.get('/api/v1/instance/extended_description', instanceDescriptionController);

app.get('/api/v1/apps/verify_credentials', appCredentialsController);
app.post('/api/v1/apps', createAppController);

app.post('/oauth/token', createTokenController);
app.post('/oauth/revoke', emptyObjectController);
app.post('/oauth/authorize', oauthAuthorizeController);
app.get('/oauth/authorize', oauthController);

app.post('/api/v1/accounts', requireProof({ pow: 20 }), createAccountController);
app.get('/api/v1/accounts/verify_credentials', requireSigner, verifyCredentialsController);
app.patch('/api/v1/accounts/update_credentials', requireSigner, updateCredentialsController);
app.get('/api/v1/accounts/search', accountSearchController);
app.get('/api/v1/accounts/lookup', accountLookupController);
app.get('/api/v1/accounts/relationships', requireSigner, relationshipsController);
app.get('/api/v1/accounts/familiar_followers', requireSigner, familiarFollowersController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/block', requireSigner, blockController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unblock', requireSigner, unblockController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/mute', requireSigner, muteController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unmute', requireSigner, unmuteController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/follow', requireSigner, followController);
app.post('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unfollow', requireSigner, unfollowController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/followers', followersController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/following', followingController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}/statuses', accountStatusesController);
app.get('/api/v1/accounts/:pubkey{[0-9a-f]{64}}', accountController);

app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/favourited_by', favouritedByController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/reblogged_by', rebloggedByController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}/context', contextController);
app.get('/api/v1/statuses/:id{[0-9a-f]{64}}', statusController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/favourite', requireSigner, favouriteController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/bookmark', requireSigner, bookmarkController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/unbookmark', requireSigner, unbookmarkController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/pin', requireSigner, pinController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/unpin', requireSigner, unpinController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/reblog', requireSigner, reblogStatusController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/unreblog', requireSigner, unreblogStatusController);
app.post('/api/v1/statuses', requireSigner, createStatusController);
app.delete('/api/v1/statuses/:id{[0-9a-f]{64}}', requireSigner, deleteStatusController);

app.get('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/quotes', quotesController);

app.post('/api/v1/media', mediaController);
app.post('/api/v2/media', mediaController);

app.get('/api/v1/timelines/home', requireSigner, homeTimelineController);
app.get('/api/v1/timelines/public', publicTimelineController);
app.get('/api/v1/timelines/tag/:hashtag', hashtagTimelineController);
app.get('/api/v1/timelines/suggested', suggestedTimelineController);

app.get('/api/v1/preferences', preferencesController);
app.get('/api/v1/search', searchController);
app.get('/api/v2/search', searchController);

app.get('/api/pleroma/frontend_configurations', frontendConfigController);

app.get('/api/v1/trends/statuses', trendingStatusesController);
app.get('/api/v1/trends/links', trendingLinksController);
app.get('/api/v1/trends/tags', trendingTagsController);
app.get('/api/v1/trends', trendingTagsController);

app.get('/api/v1/suggestions', suggestionsV1Controller);
app.get('/api/v2/suggestions', suggestionsV2Controller);

app.get('/api/v1/notifications', requireSigner, notificationsController);
app.get('/api/v1/favourites', requireSigner, favouritesController);
app.get('/api/v1/bookmarks', requireSigner, bookmarksController);
app.get('/api/v1/blocks', requireSigner, blocksController);
app.get('/api/v1/mutes', requireSigner, mutesController);

app.get('/api/v1/markers', requireProof(), markersController);
app.post('/api/v1/markers', requireProof(), updateMarkersController);

app.get('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions', reactionsController);
app.get('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions/:emoji', reactionsController);
app.put('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions/:emoji', requireSigner, reactionController);
app.delete('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions/:emoji', requireSigner, deleteReactionController);

app.get('/api/v1/pleroma/admin/config', requireRole('admin'), configController);
app.post('/api/v1/pleroma/admin/config', requireRole('admin'), updateConfigController);
app.delete('/api/v1/pleroma/admin/statuses/:id', requireRole('admin'), pleromaAdminDeleteStatusController);

app.get('/api/v1/admin/ditto/relays', requireRole('admin'), adminRelaysController);
app.put('/api/v1/admin/ditto/relays', requireRole('admin'), adminSetRelaysController);

app.post('/api/v1/ditto/names', requireSigner, nameRequestController);
app.get('/api/v1/ditto/names', requireSigner, nameRequestsController);

app.post('/api/v1/ditto/zap', requireSigner, zapController);
app.get('/api/v1/ditto/statuses/:id{[0-9a-f]{64}}/zapped_by', zappedByController);

app.post('/api/v1/reports', requireSigner, reportController);
app.get('/api/v1/admin/reports', requireSigner, requireRole('admin'), adminReportsController);
app.get('/api/v1/admin/reports/:id{[0-9a-f]{64}}', requireSigner, requireRole('admin'), adminReportController);
app.post(
  '/api/v1/admin/reports/:id{[0-9a-f]{64}}/resolve',
  requireSigner,
  requireRole('admin'),
  adminReportResolveController,
);
app.post(
  '/api/v1/admin/reports/:id{[0-9a-f]{64}}/reopen',
  requireSigner,
  requireRole('admin'),
  adminReportReopenController,
);

app.get('/api/v1/admin/accounts', requireRole('admin'), adminAccountsController);
app.post('/api/v1/admin/accounts/:id{[0-9a-f]{64}}/action', requireSigner, requireRole('admin'), adminActionController);
app.post(
  '/api/v1/admin/accounts/:id{[0-9a-f]{64}}/approve',
  requireSigner,
  requireRole('admin'),
  adminApproveController,
);
app.post('/api/v1/admin/accounts/:id{[0-9a-f]{64}}/reject', requireSigner, requireRole('admin'), adminRejectController);

app.put('/api/v1/pleroma/admin/users/tag', requireRole('admin'), pleromaAdminTagController);
app.delete('/api/v1/pleroma/admin/users/tag', requireRole('admin'), pleromaAdminUntagController);
app.patch('/api/v1/pleroma/admin/users/suggest', requireRole('admin'), pleromaAdminSuggestController);
app.patch('/api/v1/pleroma/admin/users/unsuggest', requireRole('admin'), pleromaAdminUnsuggestController);

// Not (yet) implemented.
app.get('/api/v1/custom_emojis', emptyArrayController);
app.get('/api/v1/filters', emptyArrayController);
app.get('/api/v1/domain_blocks', emptyArrayController);
app.get('/api/v1/conversations', emptyArrayController);
app.get('/api/v1/lists', emptyArrayController);

app.use('/api/*', notImplementedController);
app.use('/.well-known/*', notImplementedController);
app.use('/nodeinfo/*', notImplementedController);
app.use('/oauth/*', notImplementedController);

const publicFiles = serveStatic({ root: './public/' });
const staticFiles = serveStatic({ root: './static/' });
const frontendController = serveStatic({ path: './public/index.html' });

// Known frontend routes
app.get('/@:acct', frontendController);
app.get('/@:acct/*', frontendController);
app.get('/users/*', frontendController);
app.get('/statuses/*', frontendController);
app.get('/notice/*', frontendController);

// Known static file routes
app.get('/favicon.ico', publicFiles, staticFiles);
app.get('/images/*', publicFiles, staticFiles);
app.get('/instance/*', publicFiles);
app.get('/packs/*', publicFiles);
app.get('/sw.js', publicFiles);

// Site index
app.get('/', frontendController, indexController);

// Fallback
app.get('*', publicFiles, staticFiles, frontendController);

app.onError((err, c) => {
  if (err.message === 'canceling statement due to statement timeout') {
    return c.json({ error: 'The server was unable to respond in a timely manner' }, 500);
  }
  return c.json({ error: 'Something went wrong' }, 500);
});

export default app;

export type { AppContext, AppController, AppMiddleware };
