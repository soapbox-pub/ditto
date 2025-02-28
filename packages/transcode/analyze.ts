import { ffmpeg } from './ffmpeg.ts';

export async function ffmpegDim(
  input: ReadableStream<Uint8Array>,
): Promise<{ width: number; height: number } | undefined> {
  const result = ffmpeg(input, {
    'vf': 'showinfo', // Output as JSON
    'f': 'null', // Tell FFmpeg not to produce an output file
  });

  const text = await new Response(result).json();
  console.log(text);
  const output = JSON.parse(text);

  const [stream] = output.streams ?? [];
  return stream;
}
