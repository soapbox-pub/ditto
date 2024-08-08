export interface MastodonAttachment {
  id: string;
  type: string;
  url: string;
  preview_url?: string;
  remote_url?: string | null;
  description?: string;
  blurhash?: string | null;
  meta?: {
    original?: {
      width?: number;
      height?: number;
    };
  };
}
