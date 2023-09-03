import { type Insertable } from '@/deps.ts';

import { db, type UserRow } from '../db.ts';

interface User {
  pubkey: string;
  username: string;
  inserted_at: Date;
  admin: boolean;
}

/** Adds a user to the database. */
function insertUser(user: Insertable<UserRow>) {
  return db.insertInto('users').values(user).execute();
}

/**
 * Finds a single user based on one or more properties.
 *
 * ```ts
 * await findUser({ username: 'alex' });
 * ```
 */
async function findUser(user: Partial<Insertable<UserRow>>): Promise<User | undefined> {
  let query = db.selectFrom('users').selectAll();

  for (const [key, value] of Object.entries(user)) {
    query = query.where(key as keyof UserRow, '=', value);
  }

  const row = await query.executeTakeFirst();

  if (row) {
    return {
      ...row,
      admin: row.admin === 1,
    };
  }
}

export { findUser, insertUser, type User };
