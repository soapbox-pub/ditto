export interface FFprobeFlags {
  'v'?: string;
  'select_streams'?: string;
  'show_entries'?: string;
  'of'?: string;
  [key: string]: string | undefined;
}

export function ffprobe(path: URL | string, flags: FFprobeFlags): ReadableStream<Uint8Array> {
  const args = [];

  for (const [key, value] of Object.entries(flags)) {
    if (typeof value === 'string') {
      args.push(`-${key}`, value);
    }
  }

  args.push(path instanceof URL ? path.href : path);

  const command = new Deno.Command('ffprobe', { args, stdout: 'piped' });
  const child = command.spawn();

  return child.stdout;
}
