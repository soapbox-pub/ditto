import { register } from 'prom-client';

import { AppController } from '@/app.ts';
import { DittoDB } from '@/db/DittoDB.ts';
import { dbAvailableConnectionsGauge, dbPoolSizeGauge } from '@/metrics.ts';

/** Prometheus/OpenMetrics controller. */
export const metricsController: AppController = async (c) => {
  // Update some metrics at request time.
  dbPoolSizeGauge.set(DittoDB.poolSize);
  dbAvailableConnectionsGauge.set(DittoDB.availableConnections);

  const metrics = await register.metrics();

  const headers: HeadersInit = {
    'Content-Type': register.contentType,
  };

  return c.text(metrics, 200, headers);
};
