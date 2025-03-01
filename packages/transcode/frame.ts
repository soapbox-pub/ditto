import { ffmpeg } from './ffmpeg.ts';

export function extractVideoFrame(
  input: URL | ReadableStream<Uint8Array>,
  ss: string = '00:00:01',
): Promise<Uint8Array> {
  const output = ffmpeg(input, {
    'ss': ss, // Seek to timestamp
    'frames:v': '1', // Extract only 1 frame
    'q:v': '2', // High-quality JPEG (lower = better quality)
    'f': 'image2', // Force image format
    'loglevel': 'fatal',
  });

  return new Response(output).bytes();
}
