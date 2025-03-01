import { ffprobe } from './ffprobe.ts';

export async function getVideoDimensions(
  input: URL | ReadableStream<Uint8Array>,
): Promise<{ width: number; height: number } | null> {
  const stream = ffprobe(input, {
    'v': 'error',
    'select_streams': 'v:0',
    'show_streams': '',
    'of': 'json',
  });

  const { streams } = await new Response(stream).json();

  for (const stream of streams) {
    if (stream.codec_type === 'video') {
      const { width, height } = stream;
      return { width, height };
    }
  }

  return null;
}
