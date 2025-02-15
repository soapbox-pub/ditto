import { assert, assertEquals } from '@std/assert';

import { Conf } from '@/config.ts';
import { DeepLTranslator } from '@/translators/DeepLTranslator.ts';
import { getLanguage } from '@/test.ts';

const {
  deeplBaseUrl: baseUrl,
  deeplApiKey: apiKey,
  translationProvider,
} = Conf;

const deepl = 'deepl';

Deno.test('DeepL translation with source language omitted', {
  ignore: !(translationProvider === deepl && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, baseUrl, apiKey: apiKey! });

  const data = await translator.translate(
    [
      'Bom dia amigos',
      'Meu nome é Patrick',
      'Eu irei morar na America, eu prometo. Mas antes, eu devo mencionar que o lande está interpretando este texto como italiano, que estranho.',
    ],
    undefined,
    'en',
  );

  assertEquals(data.source_lang, 'pt');
  assertEquals(getLanguage(data.results[0]), 'en');
  assertEquals(getLanguage(data.results[1]), 'en');
  assertEquals(getLanguage(data.results[2]), 'en');
});

Deno.test('DeepL translation with source language set', {
  ignore: !(translationProvider === deepl && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, baseUrl, apiKey: apiKey as string });

  const data = await translator.translate(
    [
      'Bom dia amigos',
      'Meu nome é Patrick',
      'Eu irei morar na America, eu prometo. Mas antes, eu devo mencionar que o lande está interpretando este texto como italiano, que estranho.',
    ],
    'pt',
    'en',
  );

  assertEquals(data.source_lang, 'pt');
  assertEquals(getLanguage(data.results[0]), 'en');
  assertEquals(getLanguage(data.results[1]), 'en');
  assertEquals(getLanguage(data.results[2]), 'en');
});

Deno.test("DeepL translation doesn't alter Nostr URIs", {
  ignore: !(translationProvider === deepl && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, baseUrl, apiKey: apiKey as string });

  const patrick =
    'nostr:nprofile1qy2hwumn8ghj7erfw36x7tnsw43z7un9d3shjqpqgujeqakgt7fyp6zjggxhyy7ft623qtcaay5lkc8n8gkry4cvnrzqep59se';
  const danidfra =
    'nostr:nprofile1qy2hwumn8ghj7erfw36x7tnsw43z7un9d3shjqpqe6tnvlr46lv3lwdu80r07kanhk6jcxy5r07w9umgv9kuhu9dl5hsz44l8s';

  const input =
    `Thanks to work by ${patrick} and ${danidfra} , it's now possible to filter the global feed by language on #Ditto!`;

  const { results: [output] } = await translator.translate([input], 'en', 'pt');

  assert(output.includes(patrick));
  assert(output.includes(danidfra));
});
