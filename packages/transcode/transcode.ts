import { ffmpeg } from './ffmpeg.ts';

export function transcodeVideo(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  return ffmpeg(input, {
    'c:v': 'libx264', // Convert to H.264
    'preset': 'veryfast', // Encoding speed
    'loglevel': 'fatal', // Suppress logs
    'crf': '23', // Compression level (lower = better quality)
    'c:a': 'aac', // Convert to AAC audio
    'b:a': '128k', // Audio bitrate
    'movflags': 'frag_keyframe+empty_moov', // Ensures MP4 streaming compatibility
    'f': 'mp4', // Force MP4 format
  });
}
