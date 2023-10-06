import { UnattachedMedia } from '@/db/unattached-media.ts';
import { type TypeFest } from '@/deps.ts';

type DittoAttachment = TypeFest.SetOptional<UnattachedMedia, 'id' | 'pubkey' | 'uploaded_at'>;

function renderAttachment(media: DittoAttachment) {
  const { id, data, url } = media;
  return {
    id: id ?? url ?? data.cid,
    type: getAttachmentType(data.mime ?? ''),
    url,
    preview_url: url,
    remote_url: null,
    description: data.description ?? '',
    blurhash: data.blurhash || null,
    cid: data.cid,
  };
}

/** MIME to Mastodon API `Attachment` type. */
function getAttachmentType(mime: string): string {
  const [type] = mime.split('/');

  switch (type) {
    case 'image':
    case 'video':
    case 'audio':
      return type;
    default:
      return 'unknown';
  }
}

export { type DittoAttachment, renderAttachment };
