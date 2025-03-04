import { ffmpeg } from './ffmpeg.ts';

const uri = new URL('./buckbunny.mp4', import.meta.url);

Deno.test('ffmpeg', async () => {
  await using file = await Deno.open(uri);

  const output = ffmpeg(file.readable, {
    'c:v': 'libx264',
    'preset': 'veryfast',
    'loglevel': 'fatal',
    'movflags': 'frag_keyframe+empty_moov',
    'f': 'mp4',
  });

  await Deno.mkdir(new URL('./tmp', import.meta.url), { recursive: true });
  await Deno.writeFile(new URL('./tmp/transcoded-1.mp4', import.meta.url), output);
});

Deno.test('ffmpeg from file URI', async () => {
  const output = ffmpeg(uri, {
    'c:v': 'libx264',
    'preset': 'veryfast',
    'loglevel': 'fatal',
    'movflags': 'frag_keyframe+empty_moov',
    'f': 'mp4',
  });

  await Deno.mkdir(new URL('./tmp', import.meta.url), { recursive: true });
  await Deno.writeFile(new URL('./tmp/transcoded-2.mp4', import.meta.url), output);
});
