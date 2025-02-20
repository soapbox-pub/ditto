import { detectLanguage } from '@ditto/lang';
import { assertEquals } from '@std/assert';

import { LibreTranslateTranslator } from './LibreTranslateTranslator.ts';

Deno.test('LibreTranslate translation with source language omitted', async () => {
  const translator = mockLibreTranslate();

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

Deno.test('LibreTranslate translation with source language set', async () => {
  const translator = mockLibreTranslate();

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

function mockLibreTranslate(): LibreTranslateTranslator {
  return new LibreTranslateTranslator({
    apiKey: 'libretranslate',
    fetch: async (input, init) => {
      const req = new Request(input, init);
      const body = await req.json();

      switch (body.q) {
        case 'Bom dia amigos':
          return jsonResponse({
            detectedLanguage: { language: 'pt' },
            translatedText: 'Bon dia, amics.',
          });
        case 'Meu nome é Patrick, um nome belo ou feio? A questão é mais profunda do que parece.':
          return jsonResponse({
            detectedLanguage: { language: 'pt' },
            translatedText: 'Em dic Patrick, un nom molt o lleig? La pregunta és més profunda del que sembla.',
          });
        case 'A respiração é mais importante do que comer e tomar agua.':
          return jsonResponse({
            detectedLanguage: { language: 'pt' },
            translatedText: 'La respiració és més important que menjar i prendre aigua.',
          });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    },
  });
}

interface LibreTranslateResponse {
  translatedText: string;
  detectedLanguage?: {
    language: string;
  };
}

function jsonResponse(json: LibreTranslateResponse): Response {
  const body = JSON.stringify(json);

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
    },
  });
}
