/**
 * A bird detection's species, as Wikipedia knows it.
 *
 * A Birdstar detection (kind 2473) names its species by a Wikidata entity in
 * an `i` tag. Its English Wikipedia article gives the bird's name as a
 * sentence writes it — "Carolina wren", where the `alt` tag says "Carolina
 * Wren" — and a free picture of it, the way the app's own card shows one.
 */

import type { NostrEvent } from '@nostrify/nostrify';

import { safeUrl } from './html';

export interface Species {
  name?: string;
  image?: string;
  /** The opening of its article. */
  extract?: string;
}

const WIKIDATA_URL = /^https?:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/;

/** The Wikidata entity a detection names, by its first `i` tag that is one. */
export function wikidataId(e: NostrEvent): string | undefined {
  for (const [name, value] of e.tags) {
    const match = name === 'i' && value ? WIKIDATA_URL.exec(value.trim()) : null;
    if (match) return match[1];
  }
  return undefined;
}

/** What English Wikipedia says of a Wikidata entity, or undefined where it says nothing. */
export async function species(id: string, signal: AbortSignal): Promise<Species | undefined> {
  try {
    const entity = new URL('https://www.wikidata.org/w/api.php');
    entity.search = new URLSearchParams({
      action: 'wbgetentities', ids: id, props: 'sitelinks', sitefilter: 'enwiki', format: 'json',
    }).toString();
    const found = await json(entity, signal);
    const title = string(path(found, 'entities', id, 'sitelinks', 'enwiki', 'title'));
    if (!title) return undefined;

    const article = new URL('https://en.wikipedia.org/w/api.php');
    article.search = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', redirects: '1', titles: title,
      prop: 'pageimages|extracts', piprop: 'thumbnail', pithumbsize: '1280', exintro: '1', explaintext: '1', exsentences: '2',
    }).toString();
    const page = path(await json(article, signal), 'query', 'pages', 0);
    // "Robin (bird)" is a robin.
    const name = (string(path(page, 'title')) ?? title).replace(/\s*\([^)]*\)$/, '');
    return {
      name: name || undefined,
      image: safeUrl(string(path(page, 'thumbnail', 'source'))),
      extract: string(path(page, 'extract')),
    };
  } catch {
    return undefined;
  }
}

/** "Alex heard a Carolina wren". */
export function heard(person: string, bird: string): string {
  // Eurasian, European, Ural: a bird whose vowel is said as "you" takes "a".
  const an = /^[aeiou]/i.test(bird) && !/^(eu|uni|ural)/i.test(bird);
  return `${person} heard ${an ? 'an' : 'a'} ${bird}`;
}

async function json(url: URL, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`${url.hostname} answered ${response.status}`);
  return response.json();
}

/** A value deep in parsed JSON, by its keys and indexes, if it's there. */
function path(value: unknown, ...keys: (string | number)[]): unknown {
  let at = value;
  for (const key of keys) {
    if (!at || typeof at !== 'object') return undefined;
    at = (at as Record<string | number, unknown>)[key];
  }
  return at;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() || undefined : undefined;
}
