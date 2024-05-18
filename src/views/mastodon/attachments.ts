import * as TypeFest from 'type-fest';

import { UnattachedMedia } from '@/db/unattached-media.ts';

type DittoAttachment = TypeFest.SetOptional<UnattachedMedia, 'id' | 'pubkey' | 'uploaded_at'>;

function renderAttachment(media: DittoAttachment) {
  const { id, data, url } = media;

  const m = data.find(([name]) => name === 'm')?.[1];
  const alt = data.find(([name]) => name === 'alt')?.[1];
  const cid = data.find(([name]) => name === 'cid')?.[1];
  const blurhash = data.find(([name]) => name === 'blurhash')?.[1];

  return {
    id: id ?? url,
    type: getAttachmentType(m ?? ''),
    url,
    preview_url: url,
    remote_url: null,
    description: alt ?? '',
    blurhash: blurhash || null,
    cid: cid,
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
