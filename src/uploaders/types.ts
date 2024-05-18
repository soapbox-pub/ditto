/** Modular uploader interface, to support uploading to different backends. */
interface Uploader {
  /** Upload the file to the backend. */
  upload(file: File, opts?: { signal?: AbortSignal }): Promise<UploadResult>;
  /** Delete the file from the backend. */
  delete(cid: string, opts?: { signal?: AbortSignal }): Promise<void>;
}

/** Return value from the uploader after uploading a file. */
interface UploadResult {
  /** File ID specific to the uploader, so it can later be referenced or deleted. */
  id: string;
  /** URL where the file can be accessed. */
  url: string;
  /** SHA-256 hash of the file. */
  sha256?: string;
  /** Blurhash of the file. */
  blurhash?: string;
  /** IPFS CID of the file. */
  cid?: string;
  /** Width of the file, if applicable. */
  width?: number;
  /** Height of the file, if applicable. */
  height?: number;
}

export type { Uploader };
