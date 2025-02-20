import { DittoConf } from '@ditto/conf';
import { detectLanguage } from '@ditto/lang';
import { assertEquals } from '@std/assert';

import { LibreTranslateTranslator } from './LibreTranslateTranslator.ts';

const {
  libretranslateBaseUrl: baseUrl,
  libretranslateApiKey: apiKey,
  translationProvider,
} = new DittoConf(Deno.env);

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

  assertEquals(data.sourceLang, 'pt');
  assertEquals(detectLanguage(data.results[0], 0), 'ca');
  assertEquals(detectLanguage(data.results[1], 0), 'ca');
  assertEquals(detectLanguage(data.results[2], 0), 'ca');
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

  assertEquals(data.sourceLang, 'pt');
  assertEquals(detectLanguage(data.results[0], 0), 'ca');
  assertEquals(detectLanguage(data.results[1], 0), 'ca');
  assertEquals(detectLanguage(data.results[2], 0), 'ca');
});
