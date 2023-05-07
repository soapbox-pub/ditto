import { lodash, nip19, nip21, z } from '@/deps.ts';
import { AppController } from '@/app.ts';
import { parseBody } from '@/utils.ts';

const passwordGrantSchema = z.object({
  grant_type: z.literal('password'),
  password: z.string(),
});

const codeGrantSchema = z.object({
  grant_type: z.literal('authorization_code'),
  code: z.string(),
});

const createTokenSchema = z.discriminatedUnion('grant_type', [
  passwordGrantSchema,
  codeGrantSchema,
]);

const createTokenController: AppController = async (c) => {
  const body = await parseBody(c.req.raw);
  const data = createTokenSchema.parse(body);

  switch (data.grant_type) {
    case 'password':
      return c.json({
        access_token: data.password,
        token_type: 'Bearer',
        scope: 'read write follow push',
        created_at: Math.floor(new Date().getTime() / 1000),
      });
    case 'authorization_code':
      return c.json({
        access_token: data.code,
        token_type: 'Bearer',
        scope: 'read write follow push',
        created_at: Math.floor(new Date().getTime() / 1000),
      });
  }
};

/** Display the OAuth form. */
const oauthController: AppController = (c) => {
  const encodedUri = c.req.query('redirect_uri');
  if (!encodedUri) {
    return c.text('Missing `redirect_uri` query param.', 422);
  }

  const redirectUri = decodeURIComponent(encodedUri);

  c.res.headers.set(
    'content-security-policy',
    'default-src \'self\' \'sha256-m2qD6rbE2Ixbo2Bjy2dgQebcotRIAawW7zbmXItIYAM=\'',
  );

  return c.html(`<!DOCTYPE html>
<html lang="en">
  <head>
    <title>Log in with Ditto</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <script>
      window.addEventListener('load', function() {
        if ('nostr' in window) {
          nostr.getPublicKey().then(function(pubkey) {
            document.getElementById('pubkey').value = pubkey;
            document.getElementById('oauth_form').submit();
          });
        }
      });
    </script>
  </head>
  <body>
    <form id="oauth_form" action="/oauth/authorize" method="post">
    <input type="text" placeholder="npub1... or nsec1..." name="nip19" autocomplete="off">
      <input type="hidden" name="pubkey" id="pubkey" value="">
      <input type="hidden" name="redirect_uri" id="redirect_uri" value="${lodash.escape(redirectUri)}">
      <button type="submit">Authorize</button>
    </form>
  </body>
</html>
`);
};

const oauthAuthorizeSchema = z.object({
  pubkey: z.string().regex(/^[0-9a-f]{64}$/).optional().catch(undefined),
  nip19: z.string().regex(new RegExp(`^${nip21.BECH32_REGEX.source}$`)).optional().catch(undefined),
  redirect_uri: z.string().url(),
}).superRefine((data, ctx) => {
  if (!data.pubkey && !data.nip19) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Missing `pubkey` or `nip19`.',
    });
  }
});

const oauthAuthorizeController: AppController = async (c) => {
  const result = oauthAuthorizeSchema.safeParse(await parseBody(c.req.raw));

  if (!result.success) {
    return c.json(result.error, 422);
  }

  const { pubkey, nip19: nip19id, redirect_uri: redirectUri } = result.data;

  if (pubkey) {
    const encoded = nip19.npubEncode(pubkey!);
    const url = addCodeToRedirectUri(redirectUri, encoded);
    return c.redirect(url);
  } else if (nip19id) {
    const url = addCodeToRedirectUri(redirectUri, nip19id);
    return c.redirect(url);
  }

  return c.text('The Nostr ID was not provided or invalid.', 422);
};

/** Append the given `code` as a query param to the `redirect_uri`. */
function addCodeToRedirectUri(redirectUri: string, code: string): string {
  const url = new URL(redirectUri);
  const q = new URLSearchParams();

  q.set('code', code);
  url.search = q.toString();

  return url.toString();
}

export { createTokenController, oauthAuthorizeController, oauthController };
