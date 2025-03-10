import { assertObjectMatch } from '@std/assert';

import { analyzeFile } from './analyze.ts';

Deno.test('analyzeFile', async () => {
  const uri = new URL('./buckbunny.mp4', import.meta.url);

  const { streams } = await analyzeFile(uri);

  const videoStream = streams.find((stream) => stream.codec_type === 'video')!;

  assertObjectMatch(videoStream, { width: 1920, height: 1080 });
});
