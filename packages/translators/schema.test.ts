import { assertEquals } from '@std/assert';

import { languageSchema } from './schema.ts';

Deno.test('languageSchema', () => {
  assertEquals(languageSchema.safeParse('pt').success, true);
  assertEquals(languageSchema.safeParse('PT').success, false);
});
