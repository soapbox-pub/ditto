import { dbAvailableConnectionsGauge, dbPoolSizeGauge } from '@ditto/metrics';
import { register } from 'prom-client';

import { AppController } from '@/app.ts';

/** Prometheus/OpenMetrics controller. */
export const metricsController: AppController = async (c) => {
  const { db } = c.var;

  // Update some metrics at request time.
  dbPoolSizeGauge.set(db.poolSize);
  dbAvailableConnectionsGauge.set(db.availableConnections);

  // Serve the metrics.
  const metrics = await register.metrics();

  const headers: HeadersInit = {
    'Content-Type': register.contentType,
  };

  return c.text(metrics, 200, headers);
};
