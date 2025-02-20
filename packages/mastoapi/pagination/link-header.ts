import type { NostrEvent } from '@nostrify/nostrify';

/** Build HTTP Link header for Mastodon API pagination. */
export function buildLinkHeader(url: string, events: NostrEvent[]): string | undefined {
  if (events.length <= 1) return;

  const firstEvent = events[0];
  const lastEvent = events[events.length - 1];

  const { pathname, search } = new URL(url);

  const next = new URL(pathname + search, url);
  const prev = new URL(pathname + search, url);

  next.searchParams.set('until', String(lastEvent.created_at));
  prev.searchParams.set('since', String(firstEvent.created_at));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}

/** Build HTTP Link header for paginating Nostr lists. */
export function buildListLinkHeader(
  url: string,
  params: { offset: number; limit: number },
): string | undefined {
  const { pathname, search } = new URL(url);
  const { offset, limit } = params;

  const next = new URL(pathname + search, url);
  const prev = new URL(pathname + search, url);

  next.searchParams.set('offset', String(offset + limit));
  prev.searchParams.set('offset', String(Math.max(offset - limit, 0)));

  next.searchParams.set('limit', String(limit));
  prev.searchParams.set('limit', String(limit));

  return `<${next}>; rel="next", <${prev}>; rel="prev"`;
}
