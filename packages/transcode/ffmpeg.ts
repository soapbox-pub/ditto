export interface FFmpegFlags {
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

export function ffmpeg(input: ReadableStream<Uint8Array>, flags: FFmpegFlags): ReadableStream<Uint8Array> {
  const args = ['-i', 'pipe:0']; // Input from stdin

  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === 'string') {
      args.push(`-${key}`, value);
    }
  }

  args.push('pipe:1'); // Output to stdout

  // Spawn the FFmpeg process
  const command = new Deno.Command('ffmpeg', { args, stdin: 'piped', stdout: 'piped' });
  const child = command.spawn();

  // Pipe the input stream into FFmpeg stdin and ensure completion
  input.pipeTo(child.stdin);

  // Return the FFmpeg stdout stream
  return child.stdout;
}
