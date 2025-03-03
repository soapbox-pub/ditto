import { DittoConf } from '@ditto/conf';
import { type DittoDB, DummyDB } from '@ditto/db';
import { HTTPException } from '@hono/hono/http-exception';
import { type NRelay, NSecSigner } from '@nostrify/nostrify';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { DittoApp, type DittoAppOpts } from '../router/DittoApp.ts';

import type { Context } from '@hono/hono';
import type { User } from '../middleware/User.ts';
import { MockRelay } from '@nostrify/nostrify/test';

interface DittoVars {
  db: DittoDB;
  conf: DittoConf;
  relay: NRelay;
}

export class TestApp extends DittoApp implements AsyncDisposable {
  private _user?: User;

  constructor(opts?: Partial<DittoAppOpts>) {
    const nsec = nip19.nsecEncode(generateSecretKey());

    const conf = opts?.conf ?? new DittoConf(
      new Map([
        ['DITTO_NSEC', nsec],
        ['LOCAL_DOMAIN', 'https://ditto.pub'],
      ]),
    );

    const db = opts?.db ?? new DummyDB();
    const relay = opts?.relay ?? new MockRelay();

    super({
      db,
      conf,
      relay,
      ...opts,
    });

    this.use(async (c: Context<{ Variables: { user?: User } }>, next) => {
      c.set('user', this._user);
      await next();
    });

    this.onError((err, c) => {
      if (err instanceof HTTPException) {
        if (err.res) {
          return err.res;
        } else {
          return c.json({ error: err.message }, err.status);
        }
      }

      throw err;
    });
  }

  get var(): DittoVars {
    return {
      db: this.opts.db,
      conf: this.opts.conf,
      relay: this.opts.relay,
    };
  }

  user(user?: User): User {
    user ??= this.createUser();
    this._user = user;
    return user;
  }

  createUser(sk?: Uint8Array): User {
    return {
      relay: this.opts.relay,
      signer: new NSecSigner(sk ?? generateSecretKey()),
    };
  }

  api = {
    get: async (path: string): Promise<Response> => {
      return await this.request(path);
    },
    post: async (path: string, body: unknown): Promise<Response> => {
      return await this.request(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    },
  };

  async [Symbol.asyncDispose](): Promise<void> {
    await this.opts.db[Symbol.asyncDispose]();
  }
}
