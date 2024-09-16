import { Kysely, sql } from 'kysely';

import { DittoTables } from '@/db/DittoTables.ts';

/** Get pubkeys whose name and NIP-05 is similar to 'q' */
export async function getPubkeysBySearch(kysely: Kysely<DittoTables>, opts: { q: string; limit: number }) {
  const { q, limit } = opts;
  const pubkeys = (await sql<{ pubkey: string }>`
        SELECT *, word_similarity(${q}, search) AS sml
        FROM author_search
        WHERE ${q} % search
        ORDER BY sml DESC, search LIMIT ${limit}
      `.execute(kysely)).rows.map(({ pubkey }) => pubkey);

  return pubkeys;
}
