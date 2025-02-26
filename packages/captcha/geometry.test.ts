import { assertEquals } from '@std/assert';

import { areIntersecting } from './geometry.ts';

Deno.test('areIntersecting', () => {
  assertEquals(areIntersecting({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
  assertEquals(areIntersecting({ x: 0, y: 0, w: 10, h: 10 }, { x: 15, y: 15, w: 10, h: 10 }), false);
});
