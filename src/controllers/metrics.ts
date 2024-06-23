import { register } from 'prom-client';

import { AppController } from '@/app.ts';

/** Prometheus/OpenMetrics controller. */
export const metricsController: AppController = async (c) => {
  const metrics = await register.metrics();

  const headers: HeadersInit = {
    'Content-Type': register.contentType,
  };

  return c.text(metrics, 200, headers);
};
