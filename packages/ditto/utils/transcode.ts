export async function transcodeVideoStream(
  inputStream: ReadableStream<Uint8Array>,
): Promise<ReadableStream<Uint8Array>> {
  const command = new Deno.Command('ffmpeg', {
    args: [
      '-i',
      'pipe:0', // Read input from stdin
      '-c:v',
      'libx264', // Convert to H.264
      '-preset',
      'veryfast', // Encoding speed
      '-loglevel',
      'fatal', // Suppress logs
      '-crf',
      '23', // Compression level (lower = better quality)
      '-c:a',
      'aac', // Convert to AAC audio
      '-b:a',
      '128k', // Audio bitrate
      '-movflags',
      'frag_keyframe+empty_moov', // Ensures MP4 streaming compatibility
      '-f',
      'mp4', // Force MP4 format
      'pipe:1', // Output to stdout
    ],
    stdin: 'piped',
    stdout: 'piped',
    stderr: 'piped',
  });

  // Spawn the FFmpeg process
  const process = command.spawn();

  // Capture stderr for debugging
  const stderrPromise = new Response(process.stderr).text().then((text) => {
    if (text.trim()) console.error('FFmpeg stderr:', text);
  });

  // Pipe the input stream into FFmpeg stdin and ensure completion
  const writer = process.stdin.getWriter();
  const reader = inputStream.getReader();

  async function pumpInput() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await writer.write(value);
      }
    } finally {
      writer.close(); // Close stdin to signal FFmpeg that input is done
    }
  }

  // Start pumping input asynchronously
  pumpInput();

  // Ensure stderr logs are captured
  stderrPromise.catch(console.error);

  return process.stdout;
}
