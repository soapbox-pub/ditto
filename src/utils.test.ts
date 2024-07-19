import { isNumberFrom1To100 } from '@/utils.ts';
import { assertEquals } from 'https://deno.land/std@0.132.0/testing/asserts.ts';

Deno.test('Value is any number from 1 to 100', () => {
  assertEquals(isNumberFrom1To100('latvia'), false);
  assertEquals(isNumberFrom1To100(1.5), false);
  assertEquals(isNumberFrom1To100(Infinity), false);
  assertEquals(isNumberFrom1To100('Infinity'), false);
  assertEquals(isNumberFrom1To100('0'), false);
  assertEquals(isNumberFrom1To100(0), false);
  assertEquals(isNumberFrom1To100(-1), false);
  assertEquals(isNumberFrom1To100('-10'), false);

  for (let i = 1; i < 100; i++) {
    assertEquals(isNumberFrom1To100(String(i)), true);
  }

  assertEquals(isNumberFrom1To100('1e1'), true);
});
