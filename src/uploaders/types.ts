/** Modular uploader interface, to support uploading to different backends. */
interface Uploader {
  /** Upload the file to the backend. */
  upload(file: File): Promise<UploadResult>;
  /** Delete the file from the backend. */
  delete(cid: string): Promise<void>;
}

/** Return value from the uploader after uploading a file. */
interface UploadResult {
  /** IPFS CID for the file. */
  cid: string;
}

export type { Uploader };
