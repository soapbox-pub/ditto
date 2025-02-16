import { assertEquals, assertThrows } from '@std/assert';

import { optionalBooleanSchema, optionalNumberSchema } from './schema.ts';

Deno.test('optionalBooleanSchema', () => {
  assertEquals(optionalBooleanSchema.parse('true'), true);
  assertEquals(optionalBooleanSchema.parse('false'), false);
  assertEquals(optionalBooleanSchema.parse(undefined), undefined);

  assertThrows(() => optionalBooleanSchema.parse('invalid'));
});

Deno.test('optionalNumberSchema', () => {
  assertEquals(optionalNumberSchema.parse('123'), 123);
  assertEquals(optionalNumberSchema.parse('invalid'), NaN); // maybe this should throw?
  assertEquals(optionalNumberSchema.parse(undefined), undefined);
});
