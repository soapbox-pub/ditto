import { DittoTables } from '@ditto/db';
import { Kysely, sql } from 'kysely';

/** Get pubkeys whose name and NIP-05 is similar to 'q' */
export async function getPubkeysBySearch(
  kysely: Kysely<DittoTables>,
  opts: { q: string; limit: number; offset: number; following: Set<string> },
): Promise<Set<string>> {
  const { q, limit, following, offset } = opts;

  const pubkeys = new Set<string>();

  const query = kysely
    .selectFrom('top_authors')
    .select('pubkey')
    .where('search', sql`%>`, q)
    .limit(limit)
    .offset(offset);

  if (following.size) {
    const authorsQuery = query.where('pubkey', 'in', [...following]);

    for (const { pubkey } of await authorsQuery.execute()) {
      pubkeys.add(pubkey);
    }
  }

  if (pubkeys.size >= limit) {
    return pubkeys;
  }

  for (const { pubkey } of await query.limit(limit - pubkeys.size).execute()) {
    pubkeys.add(pubkey);
  }

  return pubkeys;
}
