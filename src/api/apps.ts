import type { Context } from '@/deps.ts';

const FAKE_APP = {
  id: '1',
  name: 'Nostrverse',
  website: null,
  redirect_uri: 'urn:ietf:wg:oauth:2.0:oob',
  client_id: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  client_secret: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  vapid_key: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};

function createAppController(c: Context) {
  return c.json(FAKE_APP);
}

function appCredentialsController(c: Context) {
  return c.json(FAKE_APP);
}

export { appCredentialsController, createAppController };
