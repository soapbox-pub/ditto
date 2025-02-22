import { parseAuthRequest } from '@ditto/nip98';
import { HTTPException } from '@hono/hono/http-exception';
import { type NostrSigner, NSecSigner } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { aesDecrypt } from '../auth/aes.ts';
import { getTokenHash } from '../auth/token.ts';
import { ConnectSigner } from '../signers/ConnectSigner.ts';
import { ReadOnlySigner } from '../signers/ReadOnlySigner.ts';
import { UserStore } from '../storages/UserStore.ts';

import type { DittoEnv, DittoMiddleware } from '@ditto/mastoapi/router';
import type { Context } from '@hono/hono';
import type { User } from './User.ts';

type CredentialsFn = (c: Context) => string | undefined;

export function tokenMiddleware(fn?: CredentialsFn): DittoMiddleware<{ user?: User }> {
  return async (c, next) => {
    const header = fn ? fn(c) : c.req.header('authorization');

    if (header) {
      const { relay, conf } = c.var;

      const auth = parseAuthorization(header);
      const signer = await getSigner(c, auth);
      const userPubkey = await signer.getPublicKey();
      const adminPubkey = await conf.signer.getPublicKey();

      const user: User = {
        signer,
        relay: new UserStore({ relay, userPubkey, adminPubkey }),
      };

      c.set('user', user);
    }

    await next();
  };
}

function getSigner(c: Context<DittoEnv>, auth: Authorization): NostrSigner | Promise<NostrSigner> {
  switch (auth.realm) {
    case 'Bearer': {
      if (isToken(auth.token)) {
        return getSignerFromToken(c, auth.token);
      } else {
        return getSignerFromNip19(auth.token);
      }
    }
    case 'Nostr': {
      return getSignerFromNip98(c);
    }
    default: {
      throw new HTTPException(400, { message: 'Unsupported Authorization realm.' });
    }
  }
}

async function getSignerFromToken(c: Context<DittoEnv>, token: `token1${string}`): Promise<NostrSigner> {
  const { conf, db, relay } = c.var;

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

async function getSignerFromNip98(c: Context<DittoEnv>): Promise<NostrSigner> {
  const { conf } = c.var;

  const req = Object.create(c.req.raw, {
    url: { value: conf.local(c.req.url) },
  });

  const result = await parseAuthRequest(req);

  if (result.success) {
    return new ReadOnlySigner(result.data.pubkey);
  } else {
    throw new HTTPException(401, { message: 'Invalid NIP-98 event in Authorization header.' });
  }
}

interface Authorization {
  realm: string;
  token: string;
}

function parseAuthorization(header: string): Authorization {
  const [realm, ...parts] = header.split(' ');
  return {
    realm,
    token: parts.join(' '),
  };
}

function isToken(value: string): value is `token1${string}` {
  return value.startsWith('token1');
}
