import { extractVideoFrame } from './frame.ts';

const uri = new URL('./buckbunny.mp4', import.meta.url);

Deno.test('extractVideoFrame', async () => {
  await using file = await Deno.open(uri);

  const result = await extractVideoFrame(file.readable);

  await Deno.mkdir(new URL('./tmp', import.meta.url), { recursive: true });
  await Deno.writeFile(new URL('./tmp/poster.jpg', import.meta.url), result);
});
