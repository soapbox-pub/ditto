import { DittoConf } from '@ditto/conf';
import { type DittoDB, DummyDB } from '@ditto/db';
import { HTTPException } from '@hono/hono/http-exception';
import { type NRelay, NSecSigner } from '@nostrify/nostrify';
import { MockRelay } from '@nostrify/nostrify/test';
import { generateSecretKey, nip19 } from 'nostr-tools';

import { DittoApp, type DittoAppOpts } from '../router/DittoApp.ts';

import type { Context } from '@hono/hono';
import type { User } from '../middleware/User.ts';
import type { DittoRoute } from '../router/DittoRoute.ts';

interface DittoVars {
  db: DittoDB;
  conf: DittoConf;
  relay: NRelay;
}

export class TestApp extends DittoApp implements AsyncDisposable {
  private _user?: User;

  constructor(route?: DittoRoute, opts?: Partial<DittoAppOpts>) {
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

    if (route) {
      this.route('/', route);
    }

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

  async admin(user?: User): Promise<User> {
    const { conf, relay } = this.opts;
    user ??= this.createUser();

    const event = await conf.signer.signEvent({
      kind: 30382,
      content: '',
      tags: [
        ['d', await user.signer.getPublicKey()],
        ['n', 'admin'],
      ],
      created_at: Math.floor(Date.now() / 1000),
    });

    await relay.event(event);

    return this.user(user);
  }

  user(user?: User): User {
    user ??= this.createUser();
    this._user = user;
    return user;
  }

  createUser(sk: Uint8Array = generateSecretKey()): User & { sk: Uint8Array } {
    return {
      relay: this.opts.relay,
      signer: new NSecSigner(sk),
      sk,
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
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    put: async (path: string, body?: unknown): Promise<Response> => {
      return await this.request(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
    },
    delete: async (path: string): Promise<Response> => {
      return await this.request(path, { method: 'DELETE' });
    },
  };

  async [Symbol.asyncDispose](): Promise<void> {
    await this.opts.db[Symbol.asyncDispose]();
  }
}
