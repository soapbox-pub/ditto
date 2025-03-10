export interface FFprobeFlags {
  'v'?: string;
  'select_streams'?: string;
  'show_entries'?: string;
  'of'?: string;
  [key: string]: string | undefined;
}

export function ffprobe(
  input: URL | ReadableStream<Uint8Array>,
  flags: FFprobeFlags,
  opts?: { ffprobePath?: string | URL },
): ReadableStream<Uint8Array> {
  const { ffprobePath = 'ffprobe' } = opts ?? {};

  const args = [];

  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === 'string') {
      if (value) {
        args.push(`-${key}`, value);
      } else {
        args.push(`-${key}`);
      }
    }
  }

  if (input instanceof URL) {
    args.push('-i', input.href);
  } else {
    args.push('-i', 'pipe:0');
  }

  // Spawn the FFprobe process
  const command = new Deno.Command(ffprobePath, {
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
