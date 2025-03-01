import { ffprobe } from './ffprobe.ts';

export async function getVideoDimensions(
  input: URL | ReadableStream<Uint8Array>,
): Promise<{ width: number; height: number } | null> {
  const stream = ffprobe(input, {
    'v': 'error',
    'select_streams': 'v:0',
    'show_entries': 'stream=width,height',
    'of': 'json',
  });

  const { streams: [result] } = await new Response(stream).json();
  return result ?? null;
}
