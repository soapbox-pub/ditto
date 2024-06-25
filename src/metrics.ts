import { Counter, Histogram, Gauge } from 'prom-client';

export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method'],
});

export const streamingConnectionsGauge = new Gauge({
  name: 'streaming_connections',
  help: 'Number of active connections to the streaming API',
});

export const fetchCounter = new Counter({
  name: 'fetch_total',
  help: 'Total number of fetch requests',
  labelNames: ['method'],
});

export const firehoseEventCounter = new Counter({
  name: 'firehose_events_total',
  help: 'Total number of Nostr events processed by the firehose',
  labelNames: ['kind'],
});

export const pipelineEventCounter = new Counter({
  name: 'pipeline_events_total',
  help: 'Total number of Nostr events processed by the pipeline',
  labelNames: ['kind'],
});

export const relayEventCounter = new Counter({
  name: 'relay_events_total',
  help: 'Total number of EVENT messages processed by the relay',
  labelNames: ['kind'],
});

export const relayMessageCounter = new Counter({
  name: 'relay_messages_total',
  help: 'Total number of Nostr messages processed by the relay',
  labelNames: ['verb'],
});

export const relayConnectionsGauge = new Gauge({
  name: 'relay_connections',
  help: 'Number of active connections to the relay',
});

export const dbQueryCounter = new Counter({
  name: 'db_query_total',
  help: 'Total number of database queries',
  labelNames: ['kind'],
});

export const dbEventCounter = new Counter({
  name: 'db_events_total',
  help: 'Total number of database inserts',
  labelNames: ['kind'],
});

export const dbPoolSizeGauge = new Gauge({
  name: 'db_pool_size',
  help: 'Number of connections in the database pool',
});

export const dbAvailableConnectionsGauge = new Gauge({
  name: 'db_available_connections',
  help: 'Number of available connections in the database pool',
});

export const dbQueryTime = new Histogram({
  name: "db_query_time",
  help: "Time taken per kysely query"
})