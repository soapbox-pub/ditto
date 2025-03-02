import { assertObjectMatch } from '@std/assert';

import { ffprobe } from './ffprobe.ts';

const uri = new URL('./buckbunny.mp4', import.meta.url);

Deno.test('ffprobe from ReadableStream', async () => {
  await using file = await Deno.open(uri);

  const stream = ffprobe(file.readable, {
    'v': 'error',
    'select_streams': 'v:0',
    'show_entries': 'stream=width,height',
    'of': 'json',
  });

  const { streams: [dimensions] } = await new Response(stream).json();

  assertObjectMatch(dimensions, { width: 1920, height: 1080 });
});

Deno.test('ffprobe from file URI', async () => {
  const stream = ffprobe(uri, {
    'v': 'error',
    'select_streams': 'v:0',
    'show_entries': 'stream=width,height',
    'of': 'json',
  });

  const { streams: [dimensions] } = await new Response(stream).json();

  assertObjectMatch(dimensions, { width: 1920, height: 1080 });
});
