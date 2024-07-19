import { isNumberFrom1To100, isObjectEmpty } from '@/utils.ts';
import { assertEquals } from '@std/assert';

Deno.test('Value is any number from 1 to 100', () => {
  assertEquals(isNumberFrom1To100('latvia'), false);
  assertEquals(isNumberFrom1To100(1.5), false);
  assertEquals(isNumberFrom1To100(Infinity), false);
  assertEquals(isNumberFrom1To100('Infinity'), false);
  assertEquals(isNumberFrom1To100('0'), false);
  assertEquals(isNumberFrom1To100(0), false);
  assertEquals(isNumberFrom1To100(-1), false);
  assertEquals(isNumberFrom1To100('-10'), false);
  assertEquals(isNumberFrom1To100([]), false);
  assertEquals(isNumberFrom1To100(undefined), false);

  for (let i = 1; i < 100; i++) {
    assertEquals(isNumberFrom1To100(String(i)), true);
  }

  assertEquals(isNumberFrom1To100('1e1'), true);
});

Deno.test('Object is empty', () => {
  assertEquals(isObjectEmpty([1]), false);
  assertEquals(isObjectEmpty({ 'yolo': 'no yolo' }), false);

  assertEquals(isObjectEmpty([]), true);
  assertEquals(isObjectEmpty({}), true);
});
