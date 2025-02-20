import { detectLanguage } from '@ditto/lang';
import { assert, assertEquals } from '@std/assert';

import { DeepLTranslator } from './DeepLTranslator.ts';

Deno.test('DeepL translation with source language omitted', async () => {
  const translator = mockDeepL({
    translations: [
      { detected_source_language: 'PT', text: 'Good morning friends' },
      { detected_source_language: 'PT', text: 'My name is Patrick' },
      {
        detected_source_language: 'PT',
        text:
          'I will live in America, I promise. But first, I should mention that lande is interpreting this text as Italian, how strange.',
      },
    ],
  });

  const data = await translator.translate(
    [
      'Bom dia amigos',
      'Meu nome é Patrick',
      'Eu irei morar na America, eu prometo. Mas antes, eu devo mencionar que o lande está interpretando este texto como italiano, que estranho.',
    ],
    undefined,
    'en',
  );

  assertEquals(data.sourceLang, 'pt');
  assertEquals(detectLanguage(data.results[0], 0), 'en');
  assertEquals(detectLanguage(data.results[1], 0), 'en');
  assertEquals(detectLanguage(data.results[2], 0), 'en');
});

Deno.test('DeepL translation with source language set', async () => {
  const translator = mockDeepL({
    translations: [
      { detected_source_language: 'PT', text: 'Good morning friends' },
      { detected_source_language: 'PT', text: 'My name is Patrick' },
      {
        detected_source_language: 'PT',
        text:
          'I will live in America, I promise. But first, I should mention that lande is interpreting this text as Italian, how strange.',
      },
    ],
  });

  const data = await translator.translate(
    [
      'Bom dia amigos',
      'Meu nome é Patrick',
      'Eu irei morar na America, eu prometo. Mas antes, eu devo mencionar que o lande está interpretando este texto como italiano, que estranho.',
    ],
    'pt',
    'en',
  );

  assertEquals(data.sourceLang, 'pt');
  assertEquals(detectLanguage(data.results[0], 0), 'en');
  assertEquals(detectLanguage(data.results[1], 0), 'en');
  assertEquals(detectLanguage(data.results[2], 0), 'en');
});

Deno.test("DeepL translation doesn't alter Nostr URIs", async () => {
  const translator = mockDeepL({
    translations: [
      {
        detected_source_language: 'EN',
        text:
          'Graças ao trabalho de nostr:nprofile1qy2hwumn8ghj7erfw36x7tnsw43z7un9d3shjqpqgujeqakgt7fyp6zjggxhyy7ft623qtcaay5lkc8n8gkry4cvnrzqep59se e nostr:nprofile1qy2hwumn8ghj7erfw36x7tnsw43z7un9d3shjqpqe6tnvlr46lv3lwdu80r07kanhk6jcxy5r07w9umgv9kuhu9dl5hsz44l8s , agora é possível filtrar o feed global por idioma no #Ditto!',
      },
    ],
  });

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

interface DeepLResponse {
  translations: {
    detected_source_language: string;
    text: string;
  }[];
}

function mockDeepL(json: DeepLResponse): DeepLTranslator {
  return new DeepLTranslator({
    apiKey: 'deepl',
    fetch: () => Promise.resolve(new Response(JSON.stringify(json))),
  });
}
