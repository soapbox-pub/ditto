import { TestApp } from '@ditto/mastoapi/test';
import { NSecSigner } from '@nostrify/nostrify';
import { genEvent } from '@nostrify/nostrify/test';
import { assertEquals } from '@std/assert';
import { generateSecretKey } from 'nostr-tools';

import route from './customEmojisRoute.ts';

Deno.test('customEmojisRoute', async (t) => {
  await using test = new TestApp(route);
  const { relay } = test.var;

  await t.step('unauth', async () => {
    const response = await test.api.get('/');
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body, []);
  });

  const sk = generateSecretKey();
  const user = test.user({ relay, signer: new NSecSigner(sk) });
  const pubkey = await user.signer.getPublicKey();

  await t.step('no emojis', async () => {
    const response = await test.api.get('/');
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body, []);
  });

  await t.step('with emoji packs', async () => {
    const pack = genEvent({
      kind: 30030,
      tags: [
        ['d', 'soapbox'],
        ['emoji', 'soapbox', 'https://soapbox.pub/favicon.ico'],
        ['emoji', 'ditto', 'https://ditto.pub/favicon.ico'],
      ],
    }, sk);

    const list = genEvent({
      kind: 10030,
      tags: [
        ['a', `30030:${pubkey}:soapbox`],
        ['emoji', 'gleasonator', 'https://gleasonator.dev/favicon.ico'],
      ],
    }, sk);

    await relay.event(pack);
    await relay.event(list);

    const response = await test.api.get('/');
    const body = await response.json();

    assertEquals(response.status, 200);
    assertEquals(body, [{
      shortcode: 'gleasonator',
      url: 'https://gleasonator.dev/favicon.ico',
      static_url: 'https://gleasonator.dev/favicon.ico',
      visible_in_picker: true,
    }, {
      shortcode: 'soapbox',
      url: 'https://soapbox.pub/favicon.ico',
      static_url: 'https://soapbox.pub/favicon.ico',
      visible_in_picker: true,
      category: 'soapbox',
    }, {
      shortcode: 'ditto',
      url: 'https://ditto.pub/favicon.ico',
      static_url: 'https://ditto.pub/favicon.ico',
      visible_in_picker: true,
      category: 'soapbox',
    }]);
  });
});
