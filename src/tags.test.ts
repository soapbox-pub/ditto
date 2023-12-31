import { assertEquals } from '@/deps-test.ts';

import { deleteTag, getTagSet, setTag } from './tags.ts';

Deno.test('getTagSet', () => {
  assertEquals(getTagSet([], 'p'), new Set());
  assertEquals(getTagSet([['p', '123']], 'p'), new Set(['123']));
  assertEquals(getTagSet([['p', '123'], ['p', '456']], 'p'), new Set(['123', '456']));
  assertEquals(getTagSet([['p', '123'], ['p', '456'], ['q', '789']], 'p'), new Set(['123', '456']));
});

Deno.test('setTag', () => {
  assertEquals(setTag([], ['p', '123']), [['p', '123']]);
  assertEquals(setTag([['p', '123']], ['p', '123']), [['p', '123']]);
  assertEquals(setTag([['p', '123'], ['p', '456']], ['p', '123']), [['p', '123'], ['p', '456']]);
  assertEquals(setTag([['p', '123'], ['p', '456']], ['p', '789']), [['p', '123'], ['p', '456'], ['p', '789']]);
});

Deno.test('deleteTag', () => {
  assertEquals(deleteTag([], ['p', '123']), []);
  assertEquals(deleteTag([['p', '123']], ['p', '123']), []);
  assertEquals(deleteTag([['p', '123']], ['p', '456']), [['p', '123']]);
  assertEquals(deleteTag([['p', '123'], ['p', '123']], ['p', '123']), []);
  assertEquals(deleteTag([['p', '123'], ['p', '456']], ['p', '456']), [['p', '123']]);
});
