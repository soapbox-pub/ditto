import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Parsed NIP-58 badge definition data. */
export interface BadgeData {
  identifier: string;
  name: string;
  description?: string;
  image?: string;
  imageDimensions?: string;
  thumbs: Array<{ url: string; dimensions?: string }>;
}

/** Parse a kind 30009 badge definition event into structured data. */
export function parseBadgeDefinition(event: NostrEvent): BadgeData | null {
  if (event.kind !== 30009) return null;

  const identifier = event.tags.find(([n]) => n === 'd')?.[1];
  if (!identifier) return null;

  const name = event.tags.find(([n]) => n === 'name')?.[1] || identifier;
  const description = event.tags.find(([n]) => n === 'description')?.[1];
  const imageTag = event.tags.find(([n]) => n === 'image');
  const image = sanitizeUrl(imageTag?.[1]);
  const imageDimensions = imageTag?.[2];

  const thumbs: Array<{ url: string; dimensions?: string }> = [];
  for (const tag of event.tags) {
    if (tag[0] === 'thumb' && tag[1]) {
      const url = sanitizeUrl(tag[1]);
      if (url) {
        thumbs.push({ url, dimensions: tag[2] });
      }
    }
  }

  return { identifier, name, description, image, imageDimensions, thumbs };
}

/** Pick the best thumbnail or image for a target pixel size. */
export function pickBadgeImage(badge: BadgeData, targetSize: number): string | undefined {
  const sorted = [...badge.thumbs].sort((a, b) => {
    const aSize = parseDimension(a.dimensions);
    const bSize = parseDimension(b.dimensions);
    return aSize - bSize;
  });

  for (const thumb of sorted) {
    const dim = parseDimension(thumb.dimensions);
    if (dim >= targetSize) return thumb.url;
  }

  return sorted[sorted.length - 1]?.url ?? badge.image;
}

function parseDimension(dim?: string): number {
  if (!dim) return 0;
  const match = dim.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}
