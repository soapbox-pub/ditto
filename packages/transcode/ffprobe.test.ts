import { assertEquals } from '@std/assert';

import { ffprobe } from './ffprobe.ts';

Deno.test('ffprobe', async () => {
  await using file = await Deno.open(new URL('./buckbunny.mp4', import.meta.url));

  const stream = ffprobe(file.readable, {
    'v': 'error',
    'select_streams': 'v:0',
    'show_entries': 'stream=width,height',
    'of': 'json',
  });

  const { streams: [dimensions] } = await new Response(stream).json();

  assertEquals(dimensions, { width: 1920, height: 1080 });
});

Deno.test('ffprobe from file', async () => {
  const uri = new URL('./buckbunny.mp4', import.meta.url);

  const stream = ffprobe(uri, {
    'v': 'error',
    'select_streams': 'v:0',
    'show_entries': 'stream=width,height',
    'of': 'json',
  });

  const { streams: [dimensions] } = await new Response(stream).json();

  assertEquals(dimensions, { width: 1920, height: 1080 });
});
