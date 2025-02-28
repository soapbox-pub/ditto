import { transcodeVideo } from './transcode.ts';

Deno.test('transcodeVideo', async () => {
  await using file = await Deno.open(new URL('./buckbunny.mp4', import.meta.url));
  const output = transcodeVideo(file.readable);

  await Deno.writeFile(new URL('./buckbunny-transcoded.mp4', import.meta.url), output);
});
