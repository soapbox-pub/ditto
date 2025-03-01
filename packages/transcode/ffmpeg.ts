export interface FFmpegFlags {
  'safe'?: string;
  'nostdin'?: string;
  'c:v'?: string;
  'preset'?: string;
  'loglevel'?: string;
  'crf'?: string;
  'c:a'?: string;
  'b:a'?: string;
  'movflags'?: string;
  'f'?: string;
  [key: string]: string | undefined;
}

export function ffmpeg(
  input: URL | ReadableStream<Uint8Array>,
  flags: FFmpegFlags,
  opts?: { ffmpegPath?: string | URL },
): ReadableStream<Uint8Array> {
  const { ffmpegPath = 'ffmpeg' } = opts ?? {};

  const args = ['-i', input instanceof URL ? input.href : 'pipe:0'];

  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === 'string') {
      if (value) {
        args.push(`-${key}`, value);
      } else {
        args.push(`-${key}`);
      }
    }
  }

  args.push('pipe:1'); // Output to stdout

  // Spawn the FFmpeg process
  const command = new Deno.Command(ffmpegPath, {
    args,
    stdin: input instanceof ReadableStream ? 'piped' : 'null',
    stdout: 'piped',
  });

  const child = command.spawn();

  // Pipe the input stream into FFmpeg stdin and ensure completion
  if (input instanceof ReadableStream) {
    input.pipeTo(child.stdin).catch((e: unknown) => {
      if (e instanceof Error && e.name === 'BrokenPipe') {
        // Ignore. ffprobe closes the pipe once it has read the metadata.
      } else {
        throw e;
      }
    });
  }

  // Return the FFmpeg stdout stream
  return child.stdout;
}
