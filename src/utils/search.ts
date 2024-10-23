import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

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
