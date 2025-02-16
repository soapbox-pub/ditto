import { confMw } from '@ditto/api/middleware';
import { type DittoConf } from '@ditto/conf';
import { DittoTables } from '@ditto/db';
import { type Context, Env as HonoEnv, Handler, Hono, Input as HonoInput, MiddlewareHandler } from '@hono/hono';
import { every } from '@hono/hono/combine';
import { cors } from '@hono/hono/cors';
import { serveStatic } from '@hono/hono/deno';
import { NostrEvent, NostrSigner, NStore, NUploader } from '@nostrify/nostrify';
import { Kysely } from 'kysely';

import '@/startup.ts';

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
import cashuApp from '@/controllers/api/cashu.ts';
import { captchaController, captchaVerifyController } from '@/controllers/api/captcha.ts';
import {
  adminRelaysController,
  adminSetRelaysController,
  deleteZapSplitsController,
  getZapSplitsController,
  nameRequestController,
  nameRequestsController,
  statusZapSplitsController,
  updateInstanceController,
  updateZapSplitsController,
} from '@/controllers/api/ditto.ts';
import { emptyArrayController, notImplementedController } from '@/controllers/api/fallback.ts';
import {
  instanceDescriptionController,
  instanceV1Controller,
  instanceV2Controller,
} from '@/controllers/api/instance.ts';
import { markersController, updateMarkersController } from '@/controllers/api/markers.ts';
import { mediaController, updateMediaController } from '@/controllers/api/media.ts';
import { mutesController } from '@/controllers/api/mutes.ts';
import { notificationController, notificationsController } from '@/controllers/api/notifications.ts';
import {
  createTokenController,
  oauthAuthorizeController,
  oauthController,
  revokeTokenController,
} from '@/controllers/api/oauth.ts';
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
import { getSubscriptionController, pushSubscribeController } from '@/controllers/api/push.ts';
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
import {
  localSuggestionsController,
  suggestionsV1Controller,
  suggestionsV2Controller,
} from '@/controllers/api/suggestions.ts';
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
import { translateController } from '@/controllers/api/translate.ts';
import { errorHandler } from '@/controllers/error.ts';
import { frontendController } from '@/controllers/frontend.ts';
import { metricsController } from '@/controllers/metrics.ts';
import { manifestController } from '@/controllers/manifest.ts';
import { nodeInfoController, nodeInfoSchemaController } from '@/controllers/well-known/nodeinfo.ts';
import { nostrController } from '@/controllers/well-known/nostr.ts';
import { DittoTranslator } from '@/interfaces/DittoTranslator.ts';
import { auth98Middleware, requireProof, requireRole } from '@/middleware/auth98Middleware.ts';
import { cacheControlMiddleware } from '@/middleware/cacheControlMiddleware.ts';
import { cspMiddleware } from '@/middleware/cspMiddleware.ts';
import { metricsMiddleware } from '@/middleware/metricsMiddleware.ts';
import { notActivitypubMiddleware } from '@/middleware/notActivitypubMiddleware.ts';
import { paginationMiddleware } from '@/middleware/paginationMiddleware.ts';
import { rateLimitMiddleware } from '@/middleware/rateLimitMiddleware.ts';
import { requireSigner } from '@/middleware/requireSigner.ts';
import { signerMiddleware } from '@/middleware/signerMiddleware.ts';
import { storeMiddleware } from '@/middleware/storeMiddleware.ts';
import { uploaderMiddleware } from '@/middleware/uploaderMiddleware.ts';
import { translatorMiddleware } from '@/middleware/translatorMiddleware.ts';
import { logiMiddleware } from '@/middleware/logiMiddleware.ts';

export interface AppEnv extends HonoEnv {
  Variables: {
    conf: DittoConf;
    /** Signer to get the logged-in user's pubkey, relays, and to sign events, or `undefined` if the user isn't logged in. */
    signer?: NostrSigner;
    /** Uploader for the user to upload files. */
    uploader?: NUploader;
    /** NIP-98 signed event proving the pubkey is owned by the user. */
    proof?: NostrEvent;
    /** Kysely instance for the database. */
    kysely: Kysely<DittoTables>;
    /** Storage for the user, might filter out unwanted content. */
    store: NStore;
    /** Normalized pagination params. */
    pagination: { since?: number; until?: number; limit: number };
    /** Normalized list pagination params. */
    listPagination: { offset: number; limit: number };
    /** Translation service. */
    translator?: DittoTranslator;
  };
}

type AppContext = Context<AppEnv>;
type AppMiddleware = MiddlewareHandler<AppEnv>;
// deno-lint-ignore no-explicit-any
type AppController<P extends string = any> = Handler<AppEnv, P, HonoInput, Response | Promise<Response>>;

const app = new Hono<AppEnv>({ strict: false });

/** User-provided files in the gitignored `public/` directory. */
const publicFiles = serveStatic({ root: './public/' });
/** Static files provided by the Ditto repo, checked into git. */
const staticFiles = serveStatic({ root: new URL('./static/', import.meta.url).pathname });

app.use(confMw(Deno.env), cacheControlMiddleware({ noStore: true }));

const ratelimit = every(
  rateLimitMiddleware(30, Time.seconds(5), false),
  rateLimitMiddleware(300, Time.minutes(5), false),
);

app.use('/api/*', metricsMiddleware, ratelimit, paginationMiddleware, logiMiddleware);
app.use('/.well-known/*', metricsMiddleware, ratelimit, logiMiddleware);
app.use('/nodeinfo/*', metricsMiddleware, ratelimit, logiMiddleware);
app.use('/oauth/*', metricsMiddleware, ratelimit, logiMiddleware);

app.get('/api/v1/streaming', metricsMiddleware, ratelimit, streamingController);
app.get('/relay', metricsMiddleware, ratelimit, relayController);

app.use(
  cspMiddleware(),
  cors({ origin: '*', exposeHeaders: ['link'] }),
  signerMiddleware,
  uploaderMiddleware,
  auth98Middleware(),
  storeMiddleware,
);

app.get('/metrics', metricsController);

app.get(
  '/.well-known/nodeinfo',
  cacheControlMiddleware({ maxAge: 300, staleWhileRevalidate: 300, staleIfError: 21600, public: true }),
  nodeInfoController,
);
app.get('/.well-known/nostr.json', nostrController);

app.get(
  '/nodeinfo/:version',
  cacheControlMiddleware({ maxAge: 300, staleWhileRevalidate: 300, staleIfError: 21600, public: true }),
  nodeInfoSchemaController,
);
app.get(
  '/manifest.webmanifest',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  manifestController,
);

app.get(
  '/api/v1/instance',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  instanceV1Controller,
);
app.get(
  '/api/v2/instance',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  instanceV2Controller,
);
app.get(
  '/api/v1/instance/extended_description',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  instanceDescriptionController,
);

app.get('/api/v1/apps/verify_credentials', appCredentialsController);
app.post('/api/v1/apps', createAppController);

app.post('/oauth/token', createTokenController);
app.post('/oauth/revoke', revokeTokenController);
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
app.post(
  '/api/v1/accounts/:pubkey{[0-9a-f]{64}}/follow',
  rateLimitMiddleware(2, Time.seconds(1)),
  requireSigner,
  followController,
);
app.post(
  '/api/v1/accounts/:pubkey{[0-9a-f]{64}}/unfollow',
  rateLimitMiddleware(2, Time.seconds(1)),
  requireSigner,
  unfollowController,
);
app.get(
  '/api/v1/accounts/:pubkey{[0-9a-f]{64}}/followers',
  rateLimitMiddleware(8, Time.seconds(30)),
  followersController,
);
app.get(
  '/api/v1/accounts/:pubkey{[0-9a-f]{64}}/following',
  rateLimitMiddleware(8, Time.seconds(30)),
  followingController,
);
app.get(
  '/api/v1/accounts/:pubkey{[0-9a-f]{64}}/statuses',
  rateLimitMiddleware(12, Time.seconds(30)),
  accountStatusesController,
);
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
app.post(
  '/api/v1/statuses/:id{[0-9a-f]{64}}/translate',
  requireSigner,
  rateLimitMiddleware(15, Time.minutes(1)),
  translatorMiddleware,
  translateController,
);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/reblog', requireSigner, reblogStatusController);
app.post('/api/v1/statuses/:id{[0-9a-f]{64}}/unreblog', requireSigner, unreblogStatusController);
app.post('/api/v1/statuses', requireSigner, createStatusController);
app.delete('/api/v1/statuses/:id{[0-9a-f]{64}}', requireSigner, deleteStatusController);

app.get('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/quotes', quotesController);

app.post('/api/v1/media', mediaController);
app.put(
  '/api/v1/media/:id{[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}}',
  updateMediaController,
);
app.post('/api/v2/media', mediaController);

app.get('/api/v1/timelines/home', rateLimitMiddleware(8, Time.seconds(30)), requireSigner, homeTimelineController);
app.get('/api/v1/timelines/public', rateLimitMiddleware(8, Time.seconds(30)), publicTimelineController);
app.get('/api/v1/timelines/tag/:hashtag', rateLimitMiddleware(8, Time.seconds(30)), hashtagTimelineController);
app.get('/api/v1/timelines/suggested', rateLimitMiddleware(8, Time.seconds(30)), suggestedTimelineController);

app.get('/api/v1/preferences', preferencesController);
app.get('/api/v1/search', searchController);
app.get('/api/v2/search', searchController);

app.get(
  '/api/pleroma/frontend_configurations',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  frontendConfigController,
);

app.get('/api/v1/trends/statuses', rateLimitMiddleware(8, Time.seconds(30)), trendingStatusesController);
app.get(
  '/api/v1/trends/links',
  cacheControlMiddleware({ maxAge: 300, staleWhileRevalidate: 300, staleIfError: 21600, public: true }),
  trendingLinksController,
);
app.get(
  '/api/v1/trends/tags',
  cacheControlMiddleware({ maxAge: 300, staleWhileRevalidate: 300, staleIfError: 21600, public: true }),
  trendingTagsController,
);
app.get(
  '/api/v1/trends',
  cacheControlMiddleware({ maxAge: 300, staleWhileRevalidate: 300, staleIfError: 21600, public: true }),
  trendingTagsController,
);

app.get('/api/v1/suggestions', suggestionsV1Controller);
app.get('/api/v2/suggestions', suggestionsV2Controller);
app.get('/api/v2/ditto/suggestions/local', localSuggestionsController);

app.get('/api/v1/notifications', rateLimitMiddleware(8, Time.seconds(30)), requireSigner, notificationsController);
app.get('/api/v1/notifications/:id', requireSigner, notificationController);

app.get('/api/v1/favourites', requireSigner, favouritesController);
app.get('/api/v1/bookmarks', requireSigner, bookmarksController);
app.get('/api/v1/blocks', requireSigner, blocksController);
app.get('/api/v1/mutes', requireSigner, mutesController);

app.get('/api/v1/markers', requireProof(), markersController);
app.post('/api/v1/markers', requireProof(), updateMarkersController);

app.get('/api/v1/push/subscription', requireSigner, getSubscriptionController);
app.post('/api/v1/push/subscription', requireProof(), pushSubscribeController);

app.get('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions', reactionsController);
app.get('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions/:emoji', reactionsController);
app.put('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions/:emoji', requireSigner, reactionController);
app.delete('/api/v1/pleroma/statuses/:id{[0-9a-f]{64}}/reactions/:emoji', requireSigner, deleteReactionController);

app.get('/api/v1/pleroma/admin/config', requireRole('admin'), configController);
app.post('/api/v1/pleroma/admin/config', requireRole('admin'), updateConfigController);
app.delete('/api/v1/pleroma/admin/statuses/:id', requireRole('admin'), pleromaAdminDeleteStatusController);

app.get('/api/v1/admin/ditto/relays', requireRole('admin'), adminRelaysController);
app.put('/api/v1/admin/ditto/relays', requireRole('admin'), adminSetRelaysController);

app.put('/api/v1/admin/ditto/instance', requireRole('admin'), updateInstanceController);

app.post('/api/v1/ditto/names', requireSigner, nameRequestController);
app.get('/api/v1/ditto/names', requireSigner, nameRequestsController);

app.get('/api/v1/ditto/captcha', rateLimitMiddleware(3, Time.minutes(1)), captchaController);
app.post(
  '/api/v1/ditto/captcha/:id/verify',
  rateLimitMiddleware(8, Time.minutes(1)),
  requireProof(),
  captchaVerifyController,
);

app.get(
  '/api/v1/ditto/zap_splits',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, public: true }),
  getZapSplitsController,
);
app.get('/api/v1/ditto/:id{[0-9a-f]{64}}/zap_splits', statusZapSplitsController);

app.put('/api/v1/admin/ditto/zap_splits', requireRole('admin'), updateZapSplitsController);
app.delete('/api/v1/admin/ditto/zap_splits', requireRole('admin'), deleteZapSplitsController);

app.post('/api/v1/ditto/zap', requireSigner, zapController);
app.get('/api/v1/ditto/statuses/:id{[0-9a-f]{64}}/zapped_by', zappedByController);

app.route('/api/v1/ditto/cashu', cashuApp);

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
app.use('/.well-known/*', publicFiles, notImplementedController);
app.use('/nodeinfo/*', notImplementedController);
app.use('/oauth/*', notImplementedController);

// Known frontend routes
app.get('/:acct{@.*}', frontendController);
app.get('/:acct{@.*}/*', frontendController);
app.get('/:bech32{^[\x21-\x7E]{1,83}1[023456789acdefghjklmnpqrstuvwxyz]{6,}$}', frontendController);
app.get('/users/*', notActivitypubMiddleware, frontendController);
app.get('/tags/*', frontendController);
app.get('/statuses/*', frontendController);
app.get('/notice/*', frontendController);
app.get('/timeline/*', frontendController);

// Known static file routes
app.get('/sw.js', publicFiles);
app.get(
  '/favicon.ico',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  publicFiles,
  staticFiles,
);
app.get(
  '/images/*',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  publicFiles,
  staticFiles,
);
app.get(
  '/instance/*',
  cacheControlMiddleware({ maxAge: 5, staleWhileRevalidate: 5, staleIfError: 21600, public: true }),
  publicFiles,
);

// Packs contains immutable static files
app.get(
  '/packs/*',
  cacheControlMiddleware({
    maxAge: 31536000,
    staleWhileRevalidate: 86400,
    staleIfError: 21600,
    public: true,
    immutable: true,
  }),
  publicFiles,
);

app.get('/', ratelimit, frontendController);
app.get('*', publicFiles, staticFiles, ratelimit, frontendController);

app.onError(errorHandler);

export default app;

export type { AppContext, AppController, AppMiddleware };
