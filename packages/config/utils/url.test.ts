import { assertEquals } from '@std/assert';

import { mergeURLPath } from './url.ts';

Deno.test('mergeURLPath', () => {
  assertEquals(mergeURLPath('https://mario.com', '/path'), 'https://mario.com/path');
  assertEquals(mergeURLPath('https://mario.com', 'https://luigi.com/path'), 'https://mario.com/path');
  assertEquals(mergeURLPath('https://mario.com', 'https://luigi.com/path?q=1'), 'https://mario.com/path?q=1');
});
