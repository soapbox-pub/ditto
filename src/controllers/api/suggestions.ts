import { NostrFilter } from '@nostrify/nostrify';
import { matchFilter } from 'nostr-tools';

import { AppContext, AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { listPaginationSchema, paginatedList, PaginatedListParams } from '@/utils/api.ts';
import { getTagSet } from '@/utils/tags.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';

export const suggestionsV1Controller: AppController = async (c) => {
  const signal = c.req.raw.signal;
  const params = listPaginationSchema.parse(c.req.query());
  const suggestions = await renderV2Suggestions(c, params, signal);
  const accounts = suggestions.map(({ account }) => account);
  return paginatedList(c, params, accounts);
};

export const suggestionsV2Controller: AppController = async (c) => {
  const signal = c.req.raw.signal;
  const params = listPaginationSchema.parse(c.req.query());
  const suggestions = await renderV2Suggestions(c, params, signal);
  return paginatedList(c, params, suggestions);
};

async function renderV2Suggestions(c: AppContext, params: PaginatedListParams, signal?: AbortSignal) {
  const { offset, limit } = params;

  const store = c.get('store');
  const signer = c.get('signer');
  const pubkey = await signer?.getPublicKey();

  const filters: NostrFilter[] = [
    { kinds: [3], authors: [Conf.pubkey], limit: 1 },
    { kinds: [1985], '#L': ['pub.ditto.trends'], '#l': [`#p`], authors: [Conf.pubkey], limit: 1 },
  ];

  if (pubkey) {
    filters.push({ kinds: [3], authors: [pubkey], limit: 1 });
    filters.push({ kinds: [10000], authors: [pubkey], limit: 1 });
  }

  const events = await store.query(filters, { signal });

  const [suggestedEvent, followsEvent, mutesEvent, trendingEvent] = [
    events.find((event) => matchFilter({ kinds: [3], authors: [Conf.pubkey] }, event)),
    pubkey ? events.find((event) => matchFilter({ kinds: [3], authors: [pubkey] }, event)) : undefined,
    pubkey ? events.find((event) => matchFilter({ kinds: [10000], authors: [pubkey] }, event)) : undefined,
    events.find((event) =>
      matchFilter({ kinds: [1985], '#L': ['pub.ditto.trends'], '#l': [`#p`], authors: [Conf.pubkey], limit: 1 }, event)
    ),
  ];

  const [suggested, trending, follows, mutes] = [
    getTagSet(suggestedEvent?.tags ?? [], 'p'),
    getTagSet(trendingEvent?.tags ?? [], 'p'),
    getTagSet(followsEvent?.tags ?? [], 'p'),
    getTagSet(mutesEvent?.tags ?? [], 'p'),
  ];

  const ignored = follows.union(mutes);
  const pubkeys = suggested.union(trending).difference(ignored);

  if (pubkey) {
    pubkeys.delete(pubkey);
  }

  const authors = [...pubkeys].slice(offset, offset + limit);

  const profiles = await store.query(
    [{ kinds: [0], authors, limit: authors.length }],
    { signal },
  )
    .then((events) => hydrateEvents({ events, store, signal }));

  return Promise.all(authors.map(async (pubkey) => {
    const profile = profiles.find((event) => event.pubkey === pubkey);

    return {
      source: suggested.has(pubkey) ? 'staff' : 'global',
      account: profile ? await renderAccount(profile) : await accountFromPubkey(pubkey),
    };
  }));
}
