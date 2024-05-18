/** Modular uploader interface, to support uploading to different backends. */
interface Uploader {
  /** Upload the file to the backend. */
  upload(file: File, opts?: { signal?: AbortSignal }): Promise<[['url', string], ...string[][]]>;
  /** Delete the file from the backend. */
  delete?(cid: string, opts?: { signal?: AbortSignal }): Promise<void>;
}

export type { Uploader };
