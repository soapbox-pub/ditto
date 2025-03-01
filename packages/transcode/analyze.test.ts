import { assertEquals } from '@std/assert';

import { getVideoDimensions } from './analyze.ts';

Deno.test('getVideoDimensions', async () => {
  const uri = new URL('./buckbunny.mp4', import.meta.url);
  const dimensions = await getVideoDimensions(uri);

  assertEquals(dimensions, { width: 1920, height: 1080 });
});
