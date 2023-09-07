interface UploadResult {
  cid: string;
}

type Uploader = (file: File) => Promise<UploadResult>;

export type { Uploader, UploadResult };
