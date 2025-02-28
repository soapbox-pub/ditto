import { transcodeVideo } from './transcode.ts';

Deno.test('transcodeVideo', async () => {
  await using file = await Deno.open(new URL('./buckbunny.mp4', import.meta.url));
  const output = transcodeVideo(file.readable);

  await Deno.mkdir(new URL('./tmp', import.meta.url), { recursive: true });
  await Deno.writeFile(new URL('./tmp/buckbunny-transcoded.mp4', import.meta.url), output);
});
