import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

/** Get a tag value by name. */
function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Parse kind-0-style metadata from the content field. */
function parseHandlerMetadata(content: string): NostrMetadata {
  if (!content) return {};
  try {
    return JSON.parse(content) as NostrMetadata;
  } catch {
    return {};
  }
}

/** Get the website URL, preferring metadata over NIP-89 `web` handler tags. */
function getWebsiteUrl(tags: string[][], metadata: NostrMetadata): string | undefined {
  if (metadata.website) {
    return metadata.website;
  }
  for (const tag of tags) {
    if (tag[0] !== 'web') continue;
    const url = tag[1];
    if (url) {
      return url.replace(/<bech32>/g, '').replace(/\/+$/, '');
    }
  }
  return undefined;
}

/**
 * Derive the set of NIP-89 `client` tag values to count usage metrics by.
 *
 * Posts published through an app carry a `client` tag, but the exact value is
 * up to the app — some use the display name, some lowercase it, some use their
 * domain. To capture the common cases "good enough", we OR together: the app's
 * display name, its lowercased form, and the website hostname.
 *
 * Returned deduplicated, with empty values dropped.
 */
export function getClientMetricsTags(event: NostrEvent): string[] {
  const metadata = parseHandlerMetadata(event.content);
  const name = metadata.name || getTag(event.tags, 'name') || getTag(event.tags, 'd') || '';
  const websiteUrl = sanitizeUrl(getWebsiteUrl(event.tags, metadata));

  let hostname = '';
  if (websiteUrl) {
    try {
      hostname = new URL(websiteUrl).hostname.replace(/^www\./, '');
    } catch {
      hostname = '';
    }
  }

  const tags = [name, name.toLowerCase(), hostname]
    .map((t) => t.trim())
    .filter(Boolean);

  return Array.from(new Set(tags));
}
