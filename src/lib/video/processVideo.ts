import { baseName, formatDuration, readFileMeta, type FileMeta } from '@/lib/fileMetadata';

import type { ProcessedVideo, VideoWorkerRequest, VideoWorkerResponse } from './types';

/** A video ready to upload, with what's known about it. */
export interface PreparedVideo {
  /** The file to upload: compressed, remuxed, or the original. */
  file: File;
  /** imeta fields and poster frame for the uploaded file. */
  meta: FileMeta;
  action: ProcessedVideo['action'];
}

export interface PrepareVideoOptions {
  /** Called with a 0..1 fraction as a transcode advances. */
  onProgress?: (progress: number) => void;
  /** Aborts processing; the original file is uploaded instead. */
  signal?: AbortSignal;
}

/** A blank frame encodes to a few hundred bytes; not worth posting. */
const MIN_POSTER_BYTES = 750;

/** Whether WebCodecs video compression is available (older WebViews may lack it). */
export function canProcessVideo(): boolean {
  return typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof globalThis.VideoEncoder !== 'undefined'
    && typeof globalThis.VideoDecoder !== 'undefined';
}

/**
 * Compress an attached video to a size that streams well (H.264 MP4, at most
 * 720p, fast start, metadata stripped) and pull out its NIP-94 metadata and
 * poster frame. Never throws for media reasons: without WebCodecs, or when
 * the file can't be converted, the original is sent with whatever a `<video>`
 * element can tell about it.
 */
export async function prepareVideo(file: File, options: PrepareVideoOptions = {}): Promise<PreparedVideo> {
  if (canProcessVideo()) {
    try {
      const result = await runWorker(file, options);
      // A worker that couldn't even read the file found nothing to say about it.
      if (result.dim || result.poster) {
        return { file: result.file, meta: toFileMeta(result), action: result.action };
      }
    } catch {
      // Fall through to the <video> element.
    }
  }
  return { file, meta: await readFileMeta(file, file.type), action: 'passthrough' };
}

function toFileMeta(video: ProcessedVideo): FileMeta {
  const fields: [string, string][] = [];
  if (video.dim) fields.push(['dim', video.dim]);
  const duration = video.duration !== undefined ? formatDuration(video.duration) : undefined;
  if (duration) fields.push(['duration', duration]);
  if (video.blurhash) fields.push(['blurhash', video.blurhash]);
  const preview = video.poster && video.poster.size > MIN_POSTER_BYTES
    ? new File([video.poster], `${baseName(video.file.name)}-poster.jpg`, { type: 'image/jpeg' })
    : undefined;
  return { fields, preview };
}

function runWorker(file: File, options: PrepareVideoOptions): Promise<ProcessedVideo> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

    const finish = (fn: () => void) => {
      options.signal?.removeEventListener('abort', onAbort);
      worker.terminate();
      fn();
    };

    function onAbort() {
      worker.postMessage({ type: 'cancel' } satisfies VideoWorkerRequest);
      finish(() => resolve({ file, action: 'passthrough' }));
    }

    worker.onmessage = (event: MessageEvent<VideoWorkerResponse>) => {
      const message = event.data;
      if (message.type === 'progress') {
        options.onProgress?.(message.value);
      } else if (message.type === 'done') {
        finish(() => resolve(message.result));
      } else if (message.type === 'error') {
        finish(() => reject(new Error(message.message)));
      }
    };

    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'Video worker failed')));

    options.signal?.addEventListener('abort', onAbort, { once: true });
    if (options.signal?.aborted) {
      onAbort();
      return;
    }

    worker.postMessage({ type: 'process', file } satisfies VideoWorkerRequest);
  });
}
