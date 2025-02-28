import { MastodonAttachment } from '@ditto/mastoapi/types';

import { getUrlMediaType } from '@/utils/media.ts';

/** Render Mastodon media attachment. */
function renderAttachment(
  media: { id?: string; tags: string[][] },
): (MastodonAttachment & { cid?: string }) | undefined {
  const { id, tags } = media;

  const url = tags.find(([name]) => name === 'url')?.[1];

  const m = tags.find(([name]) => name === 'm')?.[1] ?? getUrlMediaType(url!);
  const alt = tags.find(([name]) => name === 'alt')?.[1];
  const cid = tags.find(([name]) => name === 'cid')?.[1];
  const dim = tags.find(([name]) => name === 'dim')?.[1];
  const image = tags.find(([key]) => key === 'image')?.[1];
  const thumb = tags.find(([key]) => key === 'thumb')?.[1];
  const blurhash = tags.find(([name]) => name === 'blurhash')?.[1];

  if (!url) return;

  const [width, height] = dim?.split('x').map(Number) ?? [null, null];

  const meta = (width && height)
    ? {
      original: {
        width,
        height,
        aspect: width / height,
      },
    }
    : undefined;

  return {
    id: id ?? url,
    type: getAttachmentType(m ?? ''),
    url,
    preview_url: image ?? thumb ?? url,
    remote_url: null,
    description: alt ?? '',
    blurhash: blurhash || null,
    meta,
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

export { renderAttachment };
