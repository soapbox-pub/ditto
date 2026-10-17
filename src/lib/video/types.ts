/** Main thread ↔ video worker message contract; separate so the main bundle skips mediabunny. */

/** What the worker made of an attached video. */
export interface ProcessedVideo {
  /** The file to upload. The original when nothing needed doing. */
  file: File;
  /** Output pixel dimensions as `"WxH"`, for the NIP-94 `dim` field. */
  dim?: string;
  /** Duration in seconds. */
  duration?: number;
  /** Blurhash of the poster frame. */
  blurhash?: string;
  /** JPEG poster frame, uploaded separately and referenced as `image`. */
  poster?: Blob;
  /** What actually happened, for logging. */
  action: 'passthrough' | 'remux' | 'transcode';
}

export type VideoWorkerRequest =
  | { type: 'process'; file: File }
  | { type: 'cancel' };

export type VideoWorkerResponse =
  | { type: 'progress'; value: number }
  | { type: 'done'; result: ProcessedVideo }
  | { type: 'error'; message: string };
