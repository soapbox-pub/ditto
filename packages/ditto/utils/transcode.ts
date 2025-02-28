export function transcodeVideo(input: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const opts = {
    'i': 'pipe:0', // Read input from stdin
    'c:v': 'libx264', // Convert to H.264
    'preset': 'veryfast', // Encoding speed
    'loglevel': 'fatal', // Suppress logs
    'crf': '23', // Compression level (lower = better quality)
    'c:a': 'aac', // Convert to AAC audio
    'b:a': '128k', // Audio bitrate
    'movflags': 'frag_keyframe+empty_moov', // Ensures MP4 streaming compatibility
    'f': 'mp4', // Force MP4 format
  };

  const command = new Deno.Command('ffmpeg', {
    args: [
      ...Object.entries(opts).flatMap(([k, v]) => [`-${k}`, v]),
      'pipe:1', // Output to stdout
    ],
    stdin: 'piped',
    stdout: 'piped',
  });

  // Spawn the FFmpeg process
  const child = command.spawn();

  // Pipe the input stream into FFmpeg stdin and ensure completion
  input.pipeTo(child.stdin);

  return child.stdout;
}
