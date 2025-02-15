import { assertEquals } from '@std/assert';

import { addTag, deleteTag, findQuoteTag, findReplyTag, getTagSet, hasTag } from './tags.ts';

Deno.test('addTag', () => {
  const tags = [['p', 'alex']];
  assertEquals(addTag(tags, ['p', 'alex']), [['p', 'alex']]);
  assertEquals(addTag(tags, ['p', 'fiatjaf']), [['p', 'alex'], ['p', 'fiatjaf']]);
});

Deno.test('deleteTag', () => {
  const tags = [['p', 'alex'], ['p', 'fiatjaf']];
  assertEquals(deleteTag(tags, ['p', 'alex']), [['p', 'fiatjaf']]);
  assertEquals(deleteTag(tags, ['p', 'fiatjaf']), [['p', 'alex']]);
});

Deno.test('findQuoteTag', () => {
  assertEquals(findQuoteTag([['q', '123']]), ['q', '123']);
  assertEquals(findQuoteTag([['e', '', '', 'mention', '456']]), ['e', '', '', 'mention', '456']);
  assertEquals(findQuoteTag([['e', '', '', 'mention', '456'], ['q', '123']]), ['q', '123']);
  assertEquals(findQuoteTag([['q', '123'], ['e', '', '', 'mention', '456']]), ['q', '123']);
});

Deno.test('findReplyTag', () => {
  const root = ['e', '123', '', 'root'];
  const reply = ['e', '456', '', 'reply'];

  assertEquals(findReplyTag([root]), root);
  assertEquals(findReplyTag([reply]), reply);
  assertEquals(findReplyTag([root, reply]), reply);
  assertEquals(findReplyTag([reply, root]), reply);
  assertEquals(findReplyTag([['e', '321'], ['e', '789']]), ['e', '789']);
  assertEquals(findReplyTag([reply, ['e', '789']]), reply);
});

Deno.test('getTagSet', () => {
  const tags = [['p', 'alex'], ['p', 'fiatjaf'], ['p', 'alex']];
  assertEquals(getTagSet(tags, 'p'), new Set(['alex', 'fiatjaf']));
});

Deno.test('hasTag', () => {
  const tags = [['p', 'alex']];
  assertEquals(hasTag(tags, ['p', 'alex']), true);
  assertEquals(hasTag(tags, ['p', 'fiatjaf']), false);
});
