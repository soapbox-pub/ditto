import { extractVideoFrame } from './frame.ts';

Deno.test('extractVideoFrame', async () => {
  const uri = new URL('./buckbunny.mp4', import.meta.url);
  const result = await extractVideoFrame(uri);

  await Deno.mkdir(new URL('./tmp', import.meta.url), { recursive: true });
  await Deno.writeFile(new URL('./tmp/buckbunny-poster.jpg', import.meta.url), result);
});
