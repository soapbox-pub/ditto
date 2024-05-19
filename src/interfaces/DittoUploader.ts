export interface DittoUploader {
  upload(file: File, opts?: { signal?: AbortSignal }): Promise<[['url', string], ...string[][]]>;
}
