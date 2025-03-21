import { assertEquals } from '@std/assert';

import { parseEmojiInput } from './custom-emoji.ts';

Deno.test('parseEmojiInput', () => {
  assertEquals(parseEmojiInput('+'), { type: 'basic', value: '+' });
  assertEquals(parseEmojiInput('🚀'), { type: 'native', native: '🚀' });
  assertEquals(parseEmojiInput(':ditto:'), { type: 'custom', shortcode: 'ditto' });
  assertEquals(parseEmojiInput('x'), undefined);
});
