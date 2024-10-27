import { Kysely, type SelectExpression, sql } from 'kysely';

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

  const lexemes = await kysely.selectNoFrom(
    sql`phraseto_tsquery(${q})` as unknown as SelectExpression<DittoTables, never>,
  )
    .execute() as { phraseto_tsquery: 'string' }[];

  // if it's just stop words, don't bother making a request to the database
  if (!lexemes[0].phraseto_tsquery) {
    return new Set();
  }

  const tokens = NIP50.parseInput(q);
  const parsedSearch = tokens.filter((t) => typeof t === 'string').join(' ');

  let query = kysely
    .selectFrom('nostr_events')
    .select('id')
    .where('kind', '=', 1)
    .orderBy(['created_at desc'])
    .limit(limit)
    .offset(offset);

  const languages = new Set<string>();
  const domains = new Set<string>();

  for (const token of tokens) {
    if (typeof token === 'object' && token.key === 'language') {
      languages.add(token.value);
    }
    if (typeof token === 'object' && token.key === 'domain') {
      domains.add(token.value);
    }
  }

  if (languages.size) {
    query = query.where('language', 'in', [...languages]);
  }

  if (domains.size) {
    const pubkeys = kysely
      .selectFrom('pubkey_domains')
      .select('pubkey')
      .where('domain', 'in', [...domains]);

    query = query.where('pubkey', 'in', pubkeys);
  }

  let queryWithoutPhraseto_tsquery = query;
  if (parsedSearch) {
    query = query.where('search', '@@', sql`phraseto_tsquery(${parsedSearch})`);
  }

  const ids = new Set((await query.execute()).map(({ id }) => id));

  // If there is no ids, fallback to `plainto_tsquery`
  if (!ids.size) {
    queryWithoutPhraseto_tsquery = queryWithoutPhraseto_tsquery.where(
      'search',
      '@@',
      sql`plainto_tsquery(${parsedSearch})`,
    );
    const ids = new Set((await queryWithoutPhraseto_tsquery.execute()).map(({ id }) => id));
    return ids;
  }

  return ids;
}
