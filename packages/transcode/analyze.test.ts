import { assertEquals } from '@std/assert';

import { ffmpegDim } from './analyze.ts';

Deno.test('ffmpegDim', async () => {
  await using file = await Deno.open(new URL('./buckbunny.mp4', import.meta.url));

  const result = await ffmpegDim(file.readable);

  assertEquals(result, { width: 1280, height: 720 });
});
