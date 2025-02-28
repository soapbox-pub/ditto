export type FFmpegFlags = {
  'i': string;
  'c:v': string;
  'preset': string;
  'loglevel': string;
  'crf': string;
  'c:a': string;
  'b:a': string;
  'movflags': string;
  'f': string;
  [key: string]: string;
};

export function ffmpeg(input: BodyInit, flags: FFmpegFlags): ReadableStream<Uint8Array> {
  const command = new Deno.Command('ffmpeg', {
    args: [
      ...Object.entries(flags).flatMap(([k, v]) => [`-${k}`, v]),
      'pipe:1', // Output to stdout
    ],
    stdin: 'piped',
    stdout: 'piped',
  });

  // Spawn the FFmpeg process
  const child = command.spawn();

  // Pipe the input stream into FFmpeg stdin and ensure completion
  new Response(input).body!.pipeTo(child.stdin);

  return child.stdout;
}
