import type { Context } from '@/deps.ts';

/**
 * Apps are unnecessary cruft in Mastodon API, but necessary to make clients work.
 * So when clients try to "create" an app, pretend they did and return a hardcoded app.
 */
const FAKE_APP = {
  id: '1',
  name: 'Ditto',
  website: null,
  redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
  client_id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', // he cry
  client_secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', // 😱 😱 😱
  vapid_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};

async function createAppController(c: Context) {
  // TODO: Handle both formData and json. 422 on parsing error.
  try {
    const { redirect_uris } = await c.req.json();

    return c.json({
      ...FAKE_APP,
      redirect_uri: redirect_uris || FAKE_APP.redirect_uri,
    });
  } catch (_e) {
    return c.json(FAKE_APP);
  }
}

function appCredentialsController(c: Context) {
  return c.json(FAKE_APP);
}

export { appCredentialsController, createAppController };
