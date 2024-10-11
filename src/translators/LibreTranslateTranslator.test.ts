import { assertEquals } from '@std/assert';

import { Conf } from '@/config.ts';
import { LibreTranslateTranslator } from '@/translators/LibreTranslateTranslator.ts';
import { getLanguage } from '@/test.ts';

const {
  libretranslateBaseUrl: baseUrl,
  libretranslateApiKey: apiKey,
  translationProvider,
} = Conf;

const libretranslate = 'libretranslate';

Deno.test('LibreTranslate translation with source language omitted', {
  ignore: !(translationProvider === libretranslate && apiKey),
}, async () => {
  const translator = new LibreTranslateTranslator({ fetch: fetch, baseUrl, apiKey: apiKey! });

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
  ignore: !(translationProvider === libretranslate && apiKey),
}, async () => {
  const translator = new LibreTranslateTranslator({ fetch: fetch, baseUrl, apiKey: apiKey! });

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
