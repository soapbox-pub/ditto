import { Counter, Gauge, Histogram } from 'prom-client';

const prefix = 'ditto';

export const httpRequestsCounter: Counter<'method'> = new Counter({
  name: `${prefix}_http_requests_total`,
  help: 'Total number of HTTP requests',
  labelNames: ['method'],
});

export const httpResponsesCounter: Counter<'method' | 'path' | 'status'> = new Counter({
  name: `${prefix}_http_responses_total`,
  help: 'Total number of HTTP responses',
  labelNames: ['method', 'path', 'status'],
});

export const httpResponseDurationHistogram: Histogram<'method' | 'path' | 'status'> = new Histogram({
  name: `${prefix}_http_response_duration_seconds`,
  help: 'Histogram of HTTP response times in seconds',
  labelNames: ['method', 'path', 'status'],
});

export const streamingConnectionsGauge: Gauge = new Gauge({
  name: `${prefix}_streaming_connections`,
  help: 'Number of active connections to the streaming API',
});

export const streamingServerMessagesCounter: Counter = new Counter({
  name: `${prefix}_streaming_server_messages_total`,
  help: 'Total number of messages sent from the streaming API',
});

export const streamingClientMessagesCounter: Counter = new Counter({
  name: `${prefix}_streaming_client_messages_total`,
  help: 'Total number of messages received by the streaming API',
});

export const fetchResponsesCounter: Counter<'method' | 'status'> = new Counter({
  name: `${prefix}_fetch_responses_total`,
  help: 'Total number of fetch requests',
  labelNames: ['method', 'status'],
});

export const firehoseEventsCounter: Counter<'kind'> = new Counter({
  name: `${prefix}_firehose_events_total`,
  help: 'Total number of Nostr events processed by the firehose',
  labelNames: ['kind'],
});

export const pipelineEventsCounter: Counter<'kind'> = new Counter({
  name: `${prefix}_pipeline_events_total`,
  help: 'Total number of Nostr events processed by the pipeline',
  labelNames: ['kind'],
});

export const policyEventsCounter: Counter<'ok'> = new Counter({
  name: `${prefix}_policy_events_total`,
  help: 'Total number of policy OK responses',
  labelNames: ['ok'],
});

export const relayEventsCounter: Counter<'kind'> = new Counter({
  name: `${prefix}_relay_events_total`,
  help: 'Total number of EVENT messages processed by the relay',
  labelNames: ['kind'],
});

export const relayMessagesCounter: Counter<'verb'> = new Counter({
  name: `${prefix}_relay_messages_total`,
  help: 'Total number of Nostr messages processed by the relay',
  labelNames: ['verb'],
});

export const relayConnectionsGauge: Gauge = new Gauge({
  name: `${prefix}_relay_connections`,
  help: 'Number of active connections to the relay',
});

export const dbQueriesCounter: Counter<'kind'> = new Counter({
  name: `${prefix}_db_queries_total`,
  help: 'Total number of database queries',
  labelNames: ['kind'],
});

export const dbEventsCounter: Counter<'kind'> = new Counter({
  name: `${prefix}_db_events_total`,
  help: 'Total number of database inserts',
  labelNames: ['kind'],
});

export const dbPoolSizeGauge: Gauge = new Gauge({
  name: `${prefix}_db_pool_size`,
  help: 'Number of connections in the database pool',
});

export const dbAvailableConnectionsGauge: Gauge = new Gauge({
  name: `${prefix}_db_available_connections`,
  help: 'Number of available connections in the database pool',
});

export const dbQueryDurationHistogram: Histogram = new Histogram({
  name: `${prefix}_db_query_duration_seconds`,
  help: 'Duration of database queries',
});

export const cachedFaviconsSizeGauge: Gauge = new Gauge({
  name: `${prefix}_cached_favicons_size`,
  help: 'Number of domain favicons in cache',
});

export const cachedLnurlsSizeGauge: Gauge = new Gauge({
  name: `${prefix}_cached_lnurls_size`,
  help: 'Number of LNURL details in cache',
});

export const cachedNip05sSizeGauge: Gauge = new Gauge({
  name: `${prefix}_cached_nip05s_size`,
  help: 'Number of NIP-05 results in cache',
});

export const cachedLinkPreviewSizeGauge: Gauge = new Gauge({
  name: `${prefix}_cached_link_previews_size`,
  help: 'Number of link previews in cache',
});

export const cachedTranslationsSizeGauge: Gauge = new Gauge({
  name: `${prefix}_cached_translations_size`,
  help: 'Number of translated statuses in cache',
});

export const internalSubscriptionsSizeGauge: Gauge = new Gauge({
  name: `${prefix}_internal_subscriptions_size`,
  help: "Number of active subscriptions to Ditto's internal relay",
});

export const internalSubscriptionsBytesGauge: Gauge = new Gauge({
  name: `${prefix}_internal_subscriptions_bytes`,
  help: "Total size in bytes of active subscriptions to Ditto's internal relay",
});

export const relayPoolRelaysSizeGauge: Gauge<'ready_state'> = new Gauge({
  name: `${prefix}_relay_pool_relays_size`,
  help: 'Number of relays in the relay pool',
  labelNames: ['ready_state'],
});

export const relayPoolSubscriptionsSizeGauge: Gauge = new Gauge({
  name: `${prefix}_relay_pool_subscriptions_size`,
  help: 'Number of active subscriptions to the relay pool',
});

export const webPushNotificationsCounter: Counter<'type'> = new Counter({
  name: `${prefix}_web_push_notifications_total`,
  help: 'Total number of Web Push notifications sent',
  labelNames: ['type'],
});

export const activeAuthorSubscriptionsGauge: Gauge = new Gauge({
  name: `${prefix}_active_author_subscriptions`,
  help: "Number of active REQ's to find kind 0 events from the pool",
});
