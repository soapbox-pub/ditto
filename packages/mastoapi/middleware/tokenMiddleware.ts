import { HTTPException } from '@hono/hono/http-exception';
import { type NostrSigner, type NRelay, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { aesDecrypt } from '../auth/aes.ts';
import { getTokenHash } from '../auth/token.ts';
import { ConnectSigner } from '../signers/ConnectSigner.ts';
import { ReadOnlySigner } from '../signers/ReadOnlySigner.ts';
import { UserStore } from '../storages/UserStore.ts';

import type { DittoConf } from '@ditto/conf';
import type { DittoDB } from '@ditto/db';
import type { DittoMiddleware } from '@ditto/router';

interface User {
  signer: NostrSigner;
  relay: NRelay;
}

/** We only accept "Bearer" type. */
const BEARER_REGEX = new RegExp(`^Bearer (${nip19.BECH32_REGEX.source})$`);

export function tokenMiddleware(opts: { privileged: true; required: false }): never;
// @ts-ignore The types are right.
export function tokenMiddleware(opts: { privileged: false; required: true }): DittoMiddleware<{ user: User }>;
export function tokenMiddleware(opts: { privileged: true; required?: boolean }): DittoMiddleware<{ user: User }>;
export function tokenMiddleware(opts: { privileged: false; required?: boolean }): DittoMiddleware<{ user?: User }>;
export function tokenMiddleware(opts: { privileged: boolean; required?: boolean }): DittoMiddleware<{ user?: User }> {
  const { privileged, required = privileged } = opts;

  if (privileged && !required) {
    throw new Error('Privileged middleware requires authorization.');
  }

  return async (c, next) => {
    const header = c.req.header('authorization');

    if (header) {
      const { relay, conf } = c.var;

      const signer = await getSigner(header, c.var);
      const userPubkey = await signer.getPublicKey();
      const adminPubkey = await conf.signer.getPublicKey();

      const user: User = {
        signer,
        relay: new UserStore({ relay, userPubkey, adminPubkey }),
      };

      c.set('user', user);
    } else if (required) {
      throw new HTTPException(403, { message: 'Authorization required.' });
    }

    if (privileged) {
      // TODO: add back nip98 auth
      throw new HTTPException(500);
    }

    await next();
  };
}

interface GetSignerOpts {
  db: DittoDB;
  conf: DittoConf;
  relay: NRelay;
}

function getSigner(header: string, opts: GetSignerOpts): NostrSigner | Promise<NostrSigner> {
  const match = header.match(BEARER_REGEX);

  if (!match) {
    throw new HTTPException(400, { message: 'Invalid Authorization header.' });
  }

  const [_, bech32] = match;

  if (isToken(bech32)) {
    return getSignerFromToken(bech32, opts);
  } else {
    return getSignerFromNip19(bech32);
  }
}

function isToken(value: string): value is `token1${string}` {
  return value.startsWith('token1');
}

async function getSignerFromToken(token: `token1${string}`, opts: GetSignerOpts): Promise<NostrSigner> {
  const { conf, db, relay } = opts;

  try {
    const tokenHash = await getTokenHash(token);

    const row = await db.kysely
      .selectFrom('auth_tokens')
      .select(['pubkey', 'bunker_pubkey', 'nip46_sk_enc', 'nip46_relays'])
      .where('token_hash', '=', tokenHash)
      .executeTakeFirstOrThrow();

    const nep46Seckey = await aesDecrypt(conf.seckey, row.nip46_sk_enc);

    return new ConnectSigner({
      bunkerPubkey: row.bunker_pubkey,
      userPubkey: row.pubkey,
      signer: new NSecSigner(nep46Seckey),
      relays: row.nip46_relays,
      relay,
    });
  } catch {
    throw new HTTPException(401, { message: 'Token is wrong or expired.' });
  }
}

function getSignerFromNip19(bech32: string): NostrSigner {
  try {
    const decoded = nip19.decode(bech32);

    switch (decoded.type) {
      case 'npub':
        return new ReadOnlySigner(decoded.data);
      case 'nprofile':
        return new ReadOnlySigner(decoded.data.pubkey);
      case 'nsec':
        return new NSecSigner(decoded.data);
    }
  } catch {
    // fallthrough
  }

  throw new HTTPException(401, { message: 'Invalid NIP-19 identifier in Authorization header.' });
}
