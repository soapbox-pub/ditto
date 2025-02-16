import { Counter, Gauge, Histogram } from 'prom-client';

const prefix = 'ditto';

export const httpRequestsCounter = new Counter({
  name: `${prefix}_http_requests_total`,
  help: 'Total number of HTTP requests',
  labelNames: ['method'],
});

export const httpResponsesCounter = new Counter({
  name: `${prefix}_http_responses_total`,
  help: 'Total number of HTTP responses',
  labelNames: ['method', 'path', 'status'],
});

export const httpResponseDurationHistogram = new Histogram({
  name: `${prefix}_http_response_duration_seconds`,
  help: 'Histogram of HTTP response times in seconds',
  labelNames: ['method', 'path', 'status'],
});

export const streamingConnectionsGauge = new Gauge({
  name: `${prefix}_streaming_connections`,
  help: 'Number of active connections to the streaming API',
});

export const streamingServerMessagesCounter = new Counter({
  name: `${prefix}_streaming_server_messages_total`,
  help: 'Total number of messages sent from the streaming API',
});

export const streamingClientMessagesCounter = new Counter({
  name: `${prefix}_streaming_client_messages_total`,
  help: 'Total number of messages received by the streaming API',
});

export const fetchResponsesCounter = new Counter({
  name: `${prefix}_fetch_responses_total`,
  help: 'Total number of fetch requests',
  labelNames: ['method', 'status'],
});

export const firehoseEventsCounter = new Counter({
  name: `${prefix}_firehose_events_total`,
  help: 'Total number of Nostr events processed by the firehose',
  labelNames: ['kind'],
});

export const pipelineEventsCounter = new Counter({
  name: `${prefix}_pipeline_events_total`,
  help: 'Total number of Nostr events processed by the pipeline',
  labelNames: ['kind'],
});

export const policyEventsCounter = new Counter({
  name: `${prefix}_policy_events_total`,
  help: 'Total number of policy OK responses',
  labelNames: ['ok'],
});

export const relayEventsCounter = new Counter({
  name: `${prefix}_relay_events_total`,
  help: 'Total number of EVENT messages processed by the relay',
  labelNames: ['kind'],
});

export const relayMessagesCounter = new Counter({
  name: `${prefix}_relay_messages_total`,
  help: 'Total number of Nostr messages processed by the relay',
  labelNames: ['verb'],
});

export const relayConnectionsGauge = new Gauge({
  name: `${prefix}_relay_connections`,
  help: 'Number of active connections to the relay',
});

export const dbQueriesCounter = new Counter({
  name: `${prefix}_db_queries_total`,
  help: 'Total number of database queries',
  labelNames: ['kind'],
});

export const dbEventsCounter = new Counter({
  name: `${prefix}_db_events_total`,
  help: 'Total number of database inserts',
  labelNames: ['kind'],
});

export const dbPoolSizeGauge = new Gauge({
  name: `${prefix}_db_pool_size`,
  help: 'Number of connections in the database pool',
});

export const dbAvailableConnectionsGauge = new Gauge({
  name: `${prefix}_db_available_connections`,
  help: 'Number of available connections in the database pool',
});

export const dbQueryDurationHistogram = new Histogram({
  name: `${prefix}_db_query_duration_seconds`,
  help: 'Duration of database queries',
});

export const cachedFaviconsSizeGauge = new Gauge({
  name: `${prefix}_cached_favicons_size`,
  help: 'Number of domain favicons in cache',
});

export const cachedLnurlsSizeGauge = new Gauge({
  name: `${prefix}_cached_lnurls_size`,
  help: 'Number of LNURL details in cache',
});

export const cachedNip05sSizeGauge = new Gauge({
  name: `${prefix}_cached_nip05s_size`,
  help: 'Number of NIP-05 results in cache',
});

export const cachedLinkPreviewSizeGauge = new Gauge({
  name: `${prefix}_cached_link_previews_size`,
  help: 'Number of link previews in cache',
});

export const cachedTranslationsSizeGauge = new Gauge({
  name: `${prefix}_cached_translations_size`,
  help: 'Number of translated statuses in cache',
});

export const internalSubscriptionsSizeGauge = new Gauge({
  name: `${prefix}_internal_subscriptions_size`,
  help: "Number of active subscriptions to Ditto's internal relay",
});

export const relayPoolRelaysSizeGauge = new Gauge({
  name: `${prefix}_relay_pool_relays_size`,
  help: 'Number of relays in the relay pool',
  labelNames: ['ready_state'],
});

export const relayPoolSubscriptionsSizeGauge = new Gauge({
  name: `${prefix}_relay_pool_subscriptions_size`,
  help: 'Number of active subscriptions to the relay pool',
});

export const webPushNotificationsCounter = new Counter({
  name: `${prefix}_web_push_notifications_total`,
  help: 'Total number of Web Push notifications sent',
  labelNames: ['type'],
});
