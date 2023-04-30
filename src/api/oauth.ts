import { validator, z } from '@/deps.ts';
import { AppController } from '@/app.ts';

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

const createTokenController = validator('json', (value, c) => {
  const result = createTokenSchema.safeParse(value);

  if (result.success) {
    switch (result.data.grant_type) {
      case 'password':
        return c.json({
          access_token: result.data.password,
          token_type: 'Bearer',
          scope: 'read write follow push',
          created_at: Math.floor(new Date().getTime() / 1000),
        });
      case 'authorization_code':
        return c.json({
          access_token: result.data.code,
          token_type: 'Bearer',
          scope: 'read write follow push',
          created_at: Math.floor(new Date().getTime() / 1000),
        });
    }
  }

  return c.json({ error: 'Invalid request' }, 400);
});

/** Display the OAuth form. */
const oauthController: AppController = (c) => {
  const encodedUri = c.req.query('redirect_uri');
  if (!encodedUri) {
    return c.text('Missing `redirect_uri` query param.', 422);
  }

  const redirectUri = decodeURIComponent(encodedUri);

  // Poor man's XSS check.
  // TODO: Render form with JSX.
  try {
    new URL(redirectUri);
  } catch (_e) {
    return c.text('Invalid `redirect_uri`.', 422);
  }

  c.res.headers.set('content-security-policy', 'default-src \'self\'');

  // TODO: Login with `window.nostr` (NIP-07).
  return c.html(`<!DOCTYPE html>
  <html>
    <head>
      <title>Log in with Ditto</title>
    </head>
    <body>
      <form action="/oauth/authorize" method="post">
        <input type="text" placeholder="npub1... or nsec1..." name="nostr_id" autocomplete="off">
        <input type="hidden" name="redirect_uri" id="redirect_uri" value="${redirectUri}" autocomplete="off">
        <button type="submit">Authorize</button>
      </form>
    </body>
  </html>
  `);
};

const oauthAuthorizeController: AppController = async (c) => {
  const formData = await c.req.formData();
  const nostrId = formData.get('nostr_id');
  const redirectUri = formData.get('redirect_uri');

  if (nostrId && redirectUri) {
    const url = new URL(redirectUri.toString());
    const q = new URLSearchParams();

    q.set('code', nostrId.toString());
    url.search = q.toString();

    return c.redirect(url.toString());
  }

  return c.text('Missing `redirect_uri` or `nostr_id`.', 422);
};

export { createTokenController, oauthAuthorizeController, oauthController };
