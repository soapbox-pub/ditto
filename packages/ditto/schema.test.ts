import { assertEquals } from '@std/assert';

import { percentageSchema, sizesSchema } from '@/schema.ts';

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

Deno.test('Size or sizes has correct format', () => {
  assertEquals(sizesSchema.safeParse('orphan' as unknown).success, false);
  assertEquals(sizesSchema.safeParse('0000x 20x20' as unknown).success, false);
  assertEquals(sizesSchema.safeParse('0000x10 20X20 1x22' as unknown).success, false);
  assertEquals(sizesSchema.safeParse('1000x10 20X20 1x22' as unknown).success, true);
  assertEquals(sizesSchema.safeParse('3333X6666 1x22 f' as unknown).success, false);
  assertEquals(sizesSchema.safeParse('11xxxxxxx0 20X20 1x22' as unknown).success, false);
});
