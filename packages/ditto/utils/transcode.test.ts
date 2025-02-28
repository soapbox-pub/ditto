import { transcodeVideoStream } from './transcode.ts';

Deno.test('transcodeVideoStream', async () => {
  await using file = await Deno.open(new URL('./buckbunny.mp4', import.meta.url));
  const output = await transcodeVideoStream(file.readable);

  await Deno.writeFile(new URL('./buckbunny-transcoded.mp4', import.meta.url), output);
});
