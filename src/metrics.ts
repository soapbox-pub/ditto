import { Counter } from 'prom-client';

export const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'path'],
});

export const fetchCounter = new Counter({
  name: 'fetch_total',
  help: 'Total number of fetch requests',
  labelNames: ['method', 'path'],
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

export const relayReqCounter = new Counter({
  name: 'relay_reqs_total',
  help: 'Total number of REQ messages processed by the relay',
});

export const relayEventCounter = new Counter({
  name: 'relay_events_total',
  help: 'Total number of EVENT messages processed by the relay',
  labelNames: ['kind'],
});

export const relayCountCounter = new Counter({
  name: 'relay_counts_total',
  help: 'Total number of COUNT messages processed by the relay',
});

export const relayMessageCounter = new Counter({
  name: 'relay_messages_total',
  help: 'Total number of Nostr messages processed by the relay',
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
