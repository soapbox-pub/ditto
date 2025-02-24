import { NConnectSigner, NSchema as n, NSecSigner } from '@nostrify/nostrify';
import { escape } from 'entities';
import { generateSecretKey } from 'nostr-tools';
import { z } from 'zod';

import { AppContext, AppController } from '@/app.ts';
import { nostrNow } from '@/utils.ts';
import { parseBody } from '@/utils/api.ts';
import { aesEncrypt } from '@/utils/aes.ts';
import { generateToken, getTokenHash } from '@/utils/auth.ts';

const passwordGrantSchema = z.object({
  grant_type: z.literal('password'),
  password: z.string(),
});

const codeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string(),
});

const credentialsGrantSchema = z.object({
  grant_type: z.literal('client_credentials'),
});

const nostrGrantSchema = z.object({
  grant_type: z.literal('nostr_bunker'),
  pubkey: n.id(),
  relays: z.string().url().array().optional(),
  secret: z.string().optional(),
});

const createTokenSchema = z.discriminatedUnion('grant_type', [
  passwordGrantSchema,
  codeGrantSchema,
  credentialsGrantSchema,
  nostrGrantSchema,
]);

const createTokenController: AppController = async (c) => {
  const { conf } = c.var;

  const body = await parseBody(c.req.raw);
  const result = createTokenSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Invalid request', issues: result.error.issues }, 400);
  }

  switch (result.data.grant_type) {
    case 'nostr_bunker':
      return c.json({
        access_token: await getToken(c, result.data, conf.seckey),
        token_type: 'Bearer',
        scope: 'read write follow push',
        created_at: nostrNow(),
      });
    case 'password':
      return c.json({
        access_token: result.data.password,
        token_type: 'Bearer',
        scope: 'read write follow push',
        created_at: nostrNow(),
      });
    case 'authorization_code':
      return c.json({
        access_token: result.data.code,
        token_type: 'Bearer',
        scope: 'read write follow push',
        created_at: nostrNow(),
      });
    case 'client_credentials':
      return c.json({
        access_token: '_',
        token_type: 'Bearer',
        scope: 'read write follow push',
        created_at: nostrNow(),
      });
  }
};

// This endpoint only requires the token.
// I don't think having the app credentials solves anything.
const revokeTokenSchema = z.object({
  token: z.string(),
});

/**
 * Mastodon OAuth token revocation.
 * https://docs.joinmastodon.org/methods/oauth/#revoke
 */
const revokeTokenController: AppController = async (c) => {
  const { db } = c.var;

  const body = await parseBody(c.req.raw);
  const result = revokeTokenSchema.safeParse(body);

  if (!result.success) {
    return c.json({ error: 'Bad request', schema: result.error }, 400);
  }

  const { token } = result.data;

  const tokenHash = await getTokenHash(token as `token1${string}`);

  await db.kysely
    .deleteFrom('auth_tokens')
    .where('token_hash', '=', tokenHash)
    .execute();

  return c.json({});
};

async function getToken(
  c: AppContext,
  { pubkey: bunkerPubkey, secret, relays = [] }: { pubkey: string; secret?: string; relays?: string[] },
  dittoSeckey: Uint8Array,
): Promise<`token1${string}`> {
  const { db, relay } = c.var;
  const { token, hash } = await generateToken();

  const nip46Seckey = generateSecretKey();

  const signer = new NConnectSigner({
    encryption: 'nip44',
    pubkey: bunkerPubkey,
    signer: new NSecSigner(nip46Seckey),
    relay,
    timeout: 60_000,
  });

  await signer.connect(secret);
  const userPubkey = await signer.getPublicKey();

  await db.kysely.insertInto('auth_tokens').values({
    token_hash: hash,
    pubkey: userPubkey,
    bunker_pubkey: bunkerPubkey,
    nip46_sk_enc: await aesEncrypt(dittoSeckey, nip46Seckey),
    nip46_relays: relays,
    created_at: new Date(),
  }).execute();

  return token;
}

/** Display the OAuth form. */
const oauthController: AppController = (c) => {
  const { conf } = c.var;
  const encodedUri = c.req.query('redirect_uri');
  if (!encodedUri) {
    return c.text('Missing `redirect_uri` query param.', 422);
  }

  const state = c.req.query('state');
  const redirectUri = maybeDecodeUri(encodedUri);

  return c.html(`<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Log in with Ditto</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <style>
      html {
        background-color: #f8f8f8;
        font-family: sans-serif;
      }
      body {
        max-width: 400px;
        margin: 0 auto;
        text-align: center;
        padding: 1em;
      }
      form {
        margin: 2em 0;
        display: flex;
        justify-content: center;
        gap: 0.2em;
      }
      input, button {
        padding: 0.5em;
        border-radius: 0.5em;
        border: 1px solid;
      }
      p {
        font-size: 0.8em;
        color: #666;
      }
    </style>
  </head>
  <body>
    <h1>Nostr Connect</h1>
    <form id="oauth_form" action="/oauth/authorize" method="post">
      <input type="text" placeholder="bunker://..." name="bunker_uri" autocomplete="off" required>
      <input type="hidden" name="redirect_uri" id="redirect_uri" value="${escape(redirectUri)}">
      <input type="hidden" name="state" value="${escape(state ?? '')}">
      <button type="submit">Authorize</button>
    </form>
    <p>Sign in with a Nostr bunker app. Please configure the app to use this relay: ${conf.relay}</p>
  </body>
</html>
`);
};

/**
 * If it's already a valid URL, keep it as-is. Otherwise decode it from a URI component.
 * This fixes compatibilty with Elk: https://github.com/elk-zone/elk/issues/2089#issuecomment-1546289725
 */
function maybeDecodeUri(uri: string): string {
  try {
    new URL(uri);
    return uri;
  } catch (_e) {
    return decodeURIComponent(uri);
  }
}

/** Schema for FormData POSTed to the OAuthController. */
const oauthAuthorizeSchema = z.object({
  bunker_uri: z.string().url().refine((v) => v.startsWith('bunker://')),
  redirect_uri: z.string().url(),
  state: z.string().optional(),
});

/** Controller the OAuth form is POSTed to. */
const oauthAuthorizeController: AppController = async (c) => {
  const { conf } = c.var;

  /** FormData results in JSON. */
  const result = oauthAuthorizeSchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json(result.error, 422);
  }

  // Parsed FormData values.
  const { bunker_uri, redirect_uri: redirectUri, state } = result.data;

  const bunker = new URL(bunker_uri);

  const token = await getToken(c, {
    pubkey: bunker.hostname,
    secret: bunker.searchParams.get('secret') || undefined,
    relays: bunker.searchParams.getAll('relay'),
  }, conf.seckey);

  if (redirectUri === 'urn:ietf:wg:oauth:2.0:oob') {
    return c.text(token);
  }

  const url = addCodeToRedirectUri(redirectUri, token, state);

  return c.redirect(url);
};

/** Append the given `code` as a query param to the `redirect_uri`. */
function addCodeToRedirectUri(redirectUri: string, code: string, state?: string): string {
  const url = new URL(redirectUri);
  const q = new URLSearchParams();

  q.set('code', code);

  if (state) {
    q.set('state', state);
  }

  url.search = q.toString();

  return url.toString();
}

export { createTokenController, oauthAuthorizeController, oauthController, revokeTokenController };
