import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

/** Parse the kind-0-style JSON content of a kind 31990 event. */
export function parseAppHandlerMeta(event: NostrEvent): NostrMetadata & { web?: string } {
  if (!event.content) return {};
  try {
    return JSON.parse(event.content);
  } catch {
    return {};
  }
}

/** Validate a kind 31990 event has minimum required quality fields. */
export function validateAppHandler(event: NostrEvent): boolean {
  const meta = parseAppHandlerMeta(event);
  const name = meta.name || meta.display_name || event.tags.find(([n]) => n === 'name')?.[1];
  const picture = meta.picture || event.tags.find(([n]) => n === 'picture')?.[1] || event.tags.find(([n]) => n === 'icon')?.[1];
  const about = meta.about;
  const website = meta.website || meta.web;

  // Quality filter: must have name, picture, about, and website
  if (!name || !picture || !about || !website) return false;
  return true;
}
