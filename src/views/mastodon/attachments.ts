import * as TypeFest from 'type-fest';

import { UnattachedMedia } from '@/db/unattached-media.ts';

type DittoAttachment = TypeFest.SetOptional<UnattachedMedia, 'id' | 'pubkey' | 'uploaded_at'>;

function renderAttachment(tags: string[][]) {
  const m = tags.find(([name]) => name === 'm')?.[1];
  const url = tags.find(([name]) => name === 'url')?.[1];
  const alt = tags.find(([name]) => name === 'alt')?.[1];
  const cid = tags.find(([name]) => name === 'cid')?.[1];
  const uuid = tags.find(([name]) => name === 'uuid')?.[1];
  const blurhash = tags.find(([name]) => name === 'blurhash')?.[1];

  if (!url) return;

  return {
    id: uuid ?? url,
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
