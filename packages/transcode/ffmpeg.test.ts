import { ffmpeg } from './ffmpeg.ts';

Deno.test('ffmpeg', async () => {
  await using file = await Deno.open(new URL('./buckbunny.mp4', import.meta.url));

  const output = ffmpeg(file.readable, {
    'c:v': 'libx264',
    'preset': 'veryfast',
    'loglevel': 'fatal',
    'movflags': 'frag_keyframe+empty_moov',
    'f': 'mp4',
  });

  await Deno.mkdir(new URL('./tmp', import.meta.url), { recursive: true });
  await Deno.writeFile(new URL('./tmp/buckbunny-transcoded.mp4', import.meta.url), output);
});
