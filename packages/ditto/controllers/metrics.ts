import { register } from 'prom-client';

import { AppController } from '@/app.ts';
import {
  dbAvailableConnectionsGauge,
  dbPoolSizeGauge,
  relayPoolRelaysSizeGauge,
  relayPoolSubscriptionsSizeGauge,
} from '@/metrics.ts';
import { Storages } from '@/storages.ts';

/** Prometheus/OpenMetrics controller. */
export const metricsController: AppController = async (c) => {
  const db = await Storages.database();
  const pool = await Storages.client();

  // Update some metrics at request time.
  dbPoolSizeGauge.set(db.poolSize);
  dbAvailableConnectionsGauge.set(db.availableConnections);

  relayPoolRelaysSizeGauge.reset();
  relayPoolSubscriptionsSizeGauge.reset();

  for (const relay of pool.relays.values()) {
    relayPoolRelaysSizeGauge.inc({ ready_state: relay.socket.readyState });
    relayPoolSubscriptionsSizeGauge.inc(relay.subscriptions.length);
  }

  // Serve the metrics.
  const metrics = await register.metrics();

  const headers: HeadersInit = {
    'Content-Type': register.contentType,
  };

  return c.text(metrics, 200, headers);
};
