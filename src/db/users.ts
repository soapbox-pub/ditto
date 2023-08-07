import { type Insertable } from '@/deps.ts';

import { db, type UserRow } from '../db.ts';

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
function findUser(user: Partial<Insertable<UserRow>>) {
  let query = db.selectFrom('users').selectAll();

  for (const [key, value] of Object.entries(user)) {
    query = query.where(key as keyof UserRow, '=', value);
  }

  return query.executeTakeFirst();
}

export { findUser, insertUser };
