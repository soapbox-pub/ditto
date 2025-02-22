import { DittoConf } from '@ditto/conf';
import { type DittoDB, DummyDB } from '@ditto/db';
import { DittoApp, type DittoMiddleware } from '@ditto/mastoapi/router';
import { type NostrSigner, type NRelay, NSecSigner } from '@nostrify/nostrify';
import { MockRelay } from '@nostrify/nostrify/test';
import { generateSecretKey, nip19 } from 'nostr-tools';

import type { User } from '@ditto/mastoapi/middleware';

export function testApp(): {
  app: DittoApp;
  relay: NRelay;
  conf: DittoConf;
  db: DittoDB;
  user: {
    signer: NostrSigner;
    relay: NRelay;
  };
} {
  const db = new DummyDB();

  const nsec = nip19.nsecEncode(generateSecretKey());
  const conf = new DittoConf(new Map([['DITTO_NSEC', nsec]]));

  const relay = new MockRelay();
  const app = new DittoApp({ conf, relay, db });

  const user = {
    signer: new NSecSigner(generateSecretKey()),
    relay,
  };

  return { app, relay, conf, db, user };
}

export function setUser<S extends NostrSigner>(user: User<S>): DittoMiddleware<{ user: User<S> }> {
  return async (c, next) => {
    c.set('user', user);
    await next();
  };
}
