import { assertEquals } from '@std/assert';

import { languageSchema } from './schema.ts';

Deno.test('languageSchema', () => {
  assertEquals(languageSchema.safeParse('en').success, true);
});
