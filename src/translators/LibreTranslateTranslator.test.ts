import { assertEquals } from '@std/assert';

import { Conf } from '@/config.ts';
import { LibreTranslateTranslator } from '@/translators/LibreTranslateTranslator.ts';
import { getLanguage } from '@/test.ts';

const endpoint = Conf.libreTranslateEndpoint;
const apiKey = Conf.libreTranslateApiKey;
const translationProvider = Conf.translationProvider;
const libreTranslate = 'libretranslate';

Deno.test('LibreTranslate translation with source language omitted', {
  ignore: !(translationProvider === libreTranslate && apiKey),
}, async () => {
  const translator = new LibreTranslateTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

  const data = await translator.translate(
    [
      'Bom dia amigos',
      'Meu nome é Patrick, um nome belo ou feio? A questão é mais profunda do que parece.',
      'A respiração é mais importante do que comer e tomar agua.',
    ],
    undefined,
    'ca',
  );

  assertEquals(data.source_lang, 'pt');
  assertEquals(getLanguage(data.results[0]), 'ca');
  assertEquals(getLanguage(data.results[1]), 'ca');
  assertEquals(getLanguage(data.results[2]), 'ca');
});

Deno.test('LibreTranslate translation with source language set', {
  ignore: !(translationProvider === libreTranslate && apiKey),
}, async () => {
  const translator = new LibreTranslateTranslator({ fetch: fetch, endpoint, apiKey: apiKey as string });

  const data = await translator.translate(
    [
      'Bom dia amigos',
      'Meu nome é Patrick, um nome belo ou feio? A questão é mais profunda do que parece.',
      'A respiração é mais importante do que comer e tomar agua.',
    ],
    'pt',
    'ca',
  );

  assertEquals(data.source_lang, 'pt');
  assertEquals(getLanguage(data.results[0]), 'ca');
  assertEquals(getLanguage(data.results[1]), 'ca');
  assertEquals(getLanguage(data.results[2]), 'ca');
});
