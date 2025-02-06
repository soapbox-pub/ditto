import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';
import { NIP50 } from '@nostrify/nostrify';

/** Get pubkeys whose name and NIP-05 is similar to 'q' */
export async function getPubkeysBySearch(
  kysely: Kysely<DittoTables>,
  opts: { q: string; limit: number; offset: number; followedPubkeys: Set<string> },
): Promise<Set<string>> {
  const { q, limit, followedPubkeys, offset } = opts;

  let query = kysely
    .selectFrom('author_stats')
    .select((eb) => [
      'pubkey',
      'search',
      eb.fn('word_similarity', [sql`${q}`, 'search']).as('sml'),
    ])
    .where(() => sql`${q} <% search`)
    .orderBy(['followers_count desc'])
    .orderBy(['sml desc', 'search'])
    .limit(limit)
    .offset(offset);

  const pubkeys = new Set((await query.execute()).map(({ pubkey }) => pubkey));

  if (followedPubkeys.size > 0) {
    query = query.where('pubkey', 'in', [...followedPubkeys]);
  }

  const followingPubkeys = new Set((await query.execute()).map(({ pubkey }) => pubkey));

  return new Set(Array.from(followingPubkeys.union(pubkeys)));
}

/**
 * Get kind 1 ids whose content matches `q`.
 * It supports NIP-50 extensions.
 */
export async function getIdsBySearch(
  kysely: Kysely<DittoTables>,
  opts: { q: string; limit: number; offset: number },
): Promise<Set<string>> {
  const { q, limit, offset } = opts;

  const [lexemes] = (await sql<{ phraseto_tsquery: 'string' }>`SELECT phraseto_tsquery(${q})`.execute(kysely)).rows;

  // if it's just stop words, don't bother making a request to the database
  if (!lexemes.phraseto_tsquery) {
    return new Set();
  }

  const tokens = NIP50.parseInput(q);

  const ext: Record<string, string[]> = {};
  const txt = tokens.filter((token) => typeof token === 'string').join(' ');

  let query = kysely
    .selectFrom('nostr_events')
    .select('id')
    .where('kind', '=', 1)
    .orderBy(['created_at desc'])
    .limit(limit)
    .offset(offset);

  const domains = new Set<string>();

  for (const token of tokens) {
    if (typeof token === 'object' && token.key === 'domain') {
      domains.add(token.value);
    }
  }

  for (const token of tokens) {
    if (typeof token === 'object') {
      ext[token.key] ??= [];
      ext[token.key].push(token.value);
    }
  }

  for (let [key, values] of Object.entries(ext)) {
    if (key === 'domain' || key === '-domain') continue;

    let negated = false;

    if (key.startsWith('-')) {
      key = key.slice(1);
      negated = true;
    }

    query = query.where((eb) => {
      if (negated) {
        return eb.and(
          values.map((value) => eb.not(eb('nostr_events.search_ext', '@>', { [key]: value }))),
        );
      } else {
        return eb.or(
          values.map((value) => eb('nostr_events.search_ext', '@>', { [key]: value })),
        );
      }
    });
  }

  if (domains.size) {
    const pubkeys = (await kysely
      .selectFrom('pubkey_domains')
      .select('pubkey')
      .where('domain', 'in', [...domains])
      .execute()).map(({ pubkey }) => pubkey);

    query = query.where('pubkey', 'in', pubkeys);
  }

  // If there is not a specific content to search, return the query already
  // This is useful if the person only makes a query search such as `domain:patrickdosreis.com`
  if (!txt.length) {
    const ids = new Set((await query.execute()).map(({ id }) => id));
    return ids;
  }

  let fallbackQuery = query;
  if (txt) {
    query = query.where('search', '@@', sql`phraseto_tsquery(${txt})`);
  }

  const ids = new Set((await query.execute()).map(({ id }) => id));

  // If there is no ids, fallback to `plainto_tsquery`
  if (!ids.size) {
    fallbackQuery = fallbackQuery.where(
      'search',
      '@@',
      sql`plainto_tsquery(${txt})`,
    );
    const ids = new Set((await fallbackQuery.execute()).map(({ id }) => id));
    return ids;
  }

  return ids;
}
