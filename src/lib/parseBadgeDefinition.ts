import type { NostrEvent } from '@nostrify/nostrify';

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
  const image = imageTag?.[1];
  const imageDimensions = imageTag?.[2];

  const thumbs: Array<{ url: string; dimensions?: string }> = [];
  for (const tag of event.tags) {
    if (tag[0] === 'thumb' && tag[1]) {
      thumbs.push({ url: tag[1], dimensions: tag[2] });
    }
  }

  return { identifier, name, description, image, imageDimensions, thumbs };
}
