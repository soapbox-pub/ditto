export interface MastodonPreviewCard {
  url: string;
  title: string;
  description: string;
  type: 'link' | 'photo' | 'video' | 'rich';
  author_name: string;
  author_url: string;
  provider_name: string;
  provider_url: string;
  html: string;
  width: number;
  height: number;
  image: string | null;
  embed_url: string;
  blurhash: string | null;
}
