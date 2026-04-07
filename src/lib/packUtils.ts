import type { NostrEvent } from '@nostrify/nostrify';

/** Parse a follow pack / starter pack event into structured data. */
export function parsePackEvent(event: NostrEvent) {
  const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
  const title = getTag('title') || getTag('name') || 'Untitled Pack';
  const description = getTag('description') || getTag('summary') || '';
  const image = getTag('image') || getTag('thumb') || getTag('banner');
  const pubkeys = event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk);

  return { title, description, image, pubkeys };
}
