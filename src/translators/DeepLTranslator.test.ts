import { assertEquals } from '@std/assert';

import { Conf } from '@/config.ts';
import { DeepLTranslator } from '@/translators/DeepLTranslator.ts';
import { getLanguage } from '@/test.ts';

const endpoint = Conf.translationProviderEndpoint;
const apiKey = Conf.translationProviderApiKey;
const translationProvider = Conf.translationProvider;
const deepL = 'DeepL'.toLowerCase();

Deno.test('Translate status with EMPTY media_attachments and WITHOUT poll', {
  ignore: !(translationProvider === deepL && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

  const mastodonTranslation = await translator.translate(
    'Bom dia amigos do Element, meu nome é Patrick',
    '',
    [],
    null,
    'pt',
    'en',
  );

  assertEquals(getLanguage(mastodonTranslation.data.content), 'en');
  assertEquals(mastodonTranslation.data.spoiler_text, '');
  assertEquals(mastodonTranslation.data.media_attachments, []);
  assertEquals(mastodonTranslation.data.poll, null);
  assertEquals(mastodonTranslation.data.provider, 'DeepL.com');
});

Deno.test('Translate status WITH auto detect and with EMPTY media_attachments and WITHOUT poll', {
  ignore: !(translationProvider === deepL && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

  const mastodonTranslation = await translator.translate(
    'Bom dia amigos do Element, meu nome é Patrick',
    '',
    [],
    null,
    undefined,
    'en',
  );

  assertEquals(getLanguage(mastodonTranslation.data.content), 'en');
  assertEquals(mastodonTranslation.data.spoiler_text, '');
  assertEquals(mastodonTranslation.data.media_attachments, []);
  assertEquals(mastodonTranslation.data.poll, null);
  assertEquals(mastodonTranslation.data.provider, 'DeepL.com');
});

Deno.test('Translate status WITH media_attachments and WITHOUT poll', {
  ignore: !(translationProvider === deepL && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

  const mastodonTranslation = await translator.translate(
    'Hello my friends, my name is Alex and I am american.',
    "That is spoiler isn't it",
    [{ id: 'game', description: 'I should be playing Miles Edgeworth with my wife' }],
    null,
    'en',
    'pt',
  );

  assertEquals(getLanguage(mastodonTranslation.data.content), 'pt');
  assertEquals(getLanguage(mastodonTranslation.data.spoiler_text), 'pt');
  assertEquals(mastodonTranslation.data.media_attachments.map((value) => getLanguage(value.description)), ['pt']);
  assertEquals(mastodonTranslation.data.poll, null);
  assertEquals(mastodonTranslation.data.provider, 'DeepL.com');
});

Deno.test('Translate status WITHOUT media_attachments and WITH poll', {
  ignore: !(translationProvider === deepL && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

  const poll = {
    'id': '34858',
    'options': [
      {
        'title': 'Kill him right now',
      },
      {
        'title': 'Save him right now',
      },
    ],
  };

  const mastodonTranslation = await translator.translate(
    'Hello my friends, my name is Alex and I am american.',
    '',
    [],
    poll,
    'en',
    'pt',
  );

  assertEquals(getLanguage(mastodonTranslation.data.content), 'pt');
  assertEquals(mastodonTranslation.data.spoiler_text, '');
  assertEquals(mastodonTranslation.data.media_attachments, []);
  assertEquals(mastodonTranslation.data.poll?.options.map((value) => getLanguage(value.title)), ['pt', 'pt']);
  assertEquals(mastodonTranslation.data.provider, 'DeepL.com');
});

Deno.test('Translate status WITH media_attachments and WITH poll', {
  ignore: !(translationProvider === deepL && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

  const poll = {
    'id': '34858',
    'options': [
      {
        'title': 'Kill him right now',
      },
      {
        'title': 'Save him right now',
      },
    ],
  };

  const mastodonTranslation = await translator.translate(
    'Hello my friends, my name is Alex and I am american.',
    '',
    [{ id: 'game', description: 'I should be playing Miles Edgeworth with my wife' }],
    poll,
    'en',
    'pt',
  );

  assertEquals(getLanguage(mastodonTranslation.data.content), 'pt');
  assertEquals(mastodonTranslation.data.spoiler_text, '');
  assertEquals(mastodonTranslation.data.media_attachments.map((value) => getLanguage(value.description)), ['pt']);
  assertEquals(mastodonTranslation.data.poll?.options.map((value) => getLanguage(value.title)), ['pt', 'pt']);
  assertEquals(mastodonTranslation.data.provider, 'DeepL.com');
});
