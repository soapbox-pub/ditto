import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

/** Get pubkeys whose name and NIP-05 is similar to 'q' */
export async function getPubkeysBySearch(
  kysely: Kysely<DittoTables>,
  opts: { q: string; limit: number; followedPubkeys: Set<string> },
) {
  const { q, limit, followedPubkeys } = opts;

  let query = kysely
    .selectFrom('author_search')
    .select((eb) => [
      'pubkey',
      'search',
      eb.fn('word_similarity', [sql`${q}`, 'search']).as('sml'),
    ])
    .where(() => sql`${q} % search`)
    .orderBy(['sml desc', 'search'])
    .limit(limit);

  const pubkeys = new Set((await query.execute()).map(({ pubkey }) => pubkey));

  if (followedPubkeys.size > 0) {
    query = query.where('pubkey', 'in', [...followedPubkeys]);
  }

  const followingPubkeys = new Set((await query.execute()).map(({ pubkey }) => pubkey));

  return Array.from(followingPubkeys.union(pubkeys));
}
