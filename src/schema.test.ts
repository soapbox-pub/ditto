import { assertEquals } from '@std/assert';

import { percentageSchema } from '@/schema.ts';

Deno.test('Value is any percentage from 1 to 100', () => {
  assertEquals(percentageSchema.safeParse('latvia' as unknown).success, false);
  assertEquals(percentageSchema.safeParse(1.5).success, false);
  assertEquals(percentageSchema.safeParse(Infinity).success, false);
  assertEquals(percentageSchema.safeParse('Infinity').success, false);
  assertEquals(percentageSchema.safeParse('0').success, false);
  assertEquals(percentageSchema.safeParse(0).success, false);
  assertEquals(percentageSchema.safeParse(-1).success, false);
  assertEquals(percentageSchema.safeParse('-10').success, false);
  assertEquals(percentageSchema.safeParse([]).success, false);
  assertEquals(percentageSchema.safeParse(undefined).success, false);

  for (let i = 1; i < 100; i++) {
    assertEquals(percentageSchema.safeParse(String(i)).success, true);
  }

  assertEquals(percentageSchema.safeParse('1e1').success, true);
});
