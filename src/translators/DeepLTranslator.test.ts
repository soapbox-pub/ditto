import { assertEquals } from '@std/assert';

import { Conf } from '@/config.ts';
import { DeepLTranslator } from '@/translators/DeepLTranslator.ts';
import { getLanguage } from '@/test.ts';

const endpoint = Conf.deepLendpoint;
const apiKey = Conf.deepLapiKey;
const translationProvider = Conf.translationProvider;
const deepL = 'deepl';

Deno.test('DeepL translation with source language omitted', {
  ignore: !(translationProvider === deepL && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

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
  ignore: !(translationProvider === deepL && apiKey),
}, async () => {
  const translator = new DeepLTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

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
