import { AppContext } from '@/app.ts';
import { type Filter } from '@/deps.ts';
import * as mixer from '@/mixer.ts';
import { getAuthor } from '@/queries.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { paginated } from '@/utils/web.ts';

/** Render account objects for the author of each event. */
async function renderEventAccounts(c: AppContext, filters: Filter[]) {
  const events = await mixer.getFilters(filters);
  const pubkeys = new Set(events.map(({ pubkey }) => pubkey));

  if (!pubkeys.size) {
    return c.json([]);
  }

  const accounts = await Promise.all([...pubkeys].map(async (pubkey) => {
    const author = await getAuthor(pubkey, { relations: ['author_stats'] });
    if (author) {
      return renderAccount(author);
    }
  }));

  return paginated(c, events, accounts);
}

export { renderEventAccounts };
