import { Counter, Gauge, Histogram } from 'prom-client';

export const httpRequestsCounter = new Counter({
  name: 'ditto_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method'],
});

export const httpResponsesCounter = new Counter({
  name: 'ditto_http_responses_total',
  help: 'Total number of HTTP responses',
  labelNames: ['method', 'path', 'status'],
});

export const streamingConnectionsGauge = new Gauge({
  name: 'ditto_streaming_connections',
  help: 'Number of active connections to the streaming API',
});

export const fetchCounter = new Counter({
  name: 'ditto_fetch_total',
  help: 'Total number of fetch requests',
  labelNames: ['method'],
});

export const firehoseEventsCounter = new Counter({
  name: 'ditto_firehose_events_total',
  help: 'Total number of Nostr events processed by the firehose',
  labelNames: ['kind'],
});

export const pipelineEventsCounter = new Counter({
  name: 'ditto_pipeline_events_total',
  help: 'Total number of Nostr events processed by the pipeline',
  labelNames: ['kind'],
});

export const policyEventsCounter = new Counter({
  name: 'ditto_policy_events_total',
  help: 'Total number of policy OK responses',
  labelNames: ['ok'],
});

export const relayEventsCounter = new Counter({
  name: 'ditto_relay_events_total',
  help: 'Total number of EVENT messages processed by the relay',
  labelNames: ['kind'],
});

export const relayMessagesCounter = new Counter({
  name: 'ditto_relay_messages_total',
  help: 'Total number of Nostr messages processed by the relay',
  labelNames: ['verb'],
});

export const relayConnectionsGauge = new Gauge({
  name: 'ditto_relay_connections',
  help: 'Number of active connections to the relay',
});

export const dbQueriesCounter = new Counter({
  name: 'ditto_db_queries_total',
  help: 'Total number of database queries',
  labelNames: ['kind'],
});

export const dbEventsCounter = new Counter({
  name: 'ditto_db_events_total',
  help: 'Total number of database inserts',
  labelNames: ['kind'],
});

export const dbPoolSizeGauge = new Gauge({
  name: 'ditto_db_pool_size',
  help: 'Number of connections in the database pool',
});

export const dbAvailableConnectionsGauge = new Gauge({
  name: 'ditto_db_available_connections',
  help: 'Number of available connections in the database pool',
});

export const dbQueryDurationHistogram = new Histogram({
  name: 'ditto_db_query_duration_ms',
  help: 'Duration of database queries',
});
