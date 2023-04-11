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

function createAppController(c: Context) {
  return c.json(FAKE_APP);
}

function appCredentialsController(c: Context) {
  return c.json(FAKE_APP);
}

export { appCredentialsController, createAppController };
