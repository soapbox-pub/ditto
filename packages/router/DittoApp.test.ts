import { DittoConf } from '@ditto/conf';
import { DittoPolyPg } from '@ditto/db';
import { Hono } from '@hono/hono';
import { MockRelay } from '@nostrify/nostrify/test';

import { DittoApp } from './DittoApp.ts';
import { DittoRoute } from './DittoRoute.ts';

Deno.test('DittoApp', async () => {
  await using db = DittoPolyPg.create('memory://');
  const conf = new DittoConf(new Map());
  const relay = new MockRelay();

  const app = new DittoApp({ conf, db, relay });

  const hono = new Hono();
  const route = new DittoRoute();

  app.route('/', route);

  // @ts-expect-error Passing a non-DittoRoute to route.
  app.route('/', hono);
});
