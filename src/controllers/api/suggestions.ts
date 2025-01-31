import { NostrFilter } from '@nostrify/nostrify';
import { matchFilter } from 'nostr-tools';

import { AppContext, AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { paginated, paginatedList } from '@/utils/api.ts';
import { getTagSet } from '@/utils/tags.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';

export const suggestionsV1Controller: AppController = async (c) => {
  const signal = c.req.raw.signal;
  const params = c.get('listPagination');
  const suggestions = await renderV2Suggestions(c, params, signal);
  const accounts = suggestions.map(({ account }) => account);
  return paginatedList(c, params, accounts);
};

export const suggestionsV2Controller: AppController = async (c) => {
  const signal = c.req.raw.signal;
  const params = c.get('listPagination');
  const suggestions = await renderV2Suggestions(c, params, signal);
  return paginatedList(c, params, suggestions);
};

async function renderV2Suggestions(c: AppContext, params: { offset: number; limit: number }, signal?: AbortSignal) {
  const { offset, limit } = params;

  const store = c.get('store');
  const signer = c.get('signer');
  const pubkey = await signer?.getPublicKey();

  const filters: NostrFilter[] = [
    { kinds: [30382], authors: [Conf.pubkey], '#n': ['suggested'], limit },
    { kinds: [1985], '#L': ['pub.ditto.trends'], '#l': [`#p`], authors: [Conf.pubkey], limit: 1 },
  ];

  if (pubkey) {
    filters.push({ kinds: [3], authors: [pubkey], limit: 1 });
    filters.push({ kinds: [10000], authors: [pubkey], limit: 1 });
  }

  const events = await store.query(filters, { signal });

  const [userEvents, followsEvent, mutesEvent, trendingEvent] = [
    events.filter((event) => matchFilter({ kinds: [30382], authors: [Conf.pubkey], '#n': ['suggested'] }, event)),
    pubkey ? events.find((event) => matchFilter({ kinds: [3], authors: [pubkey] }, event)) : undefined,
    pubkey ? events.find((event) => matchFilter({ kinds: [10000], authors: [pubkey] }, event)) : undefined,
    events.find((event) =>
      matchFilter({ kinds: [1985], '#L': ['pub.ditto.trends'], '#l': [`#p`], authors: [Conf.pubkey], limit: 1 }, event)
    ),
  ];

  const suggested = new Set(
    userEvents
      .map((event) => event.tags.find(([name]) => name === 'd')?.[1])
      .filter((pubkey): pubkey is string => !!pubkey),
  );

  const [trending, follows, mutes] = [
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

export const localSuggestionsController: AppController = async (c) => {
  const signal = c.req.raw.signal;
  const params = c.get('pagination');
  const store = c.get('store');

  const grants = await store.query(
    [{ kinds: [30360], authors: [Conf.pubkey], ...params }],
    { signal },
  );

  const pubkeys = new Set<string>();

  for (const grant of grants) {
    const pubkey = grant.tags.find(([name]) => name === 'p')?.[1];
    if (pubkey) {
      pubkeys.add(pubkey);
    }
  }

  const profiles = await store.query(
    [{ kinds: [0], authors: [...pubkeys], search: `domain:${Conf.url.host}`, ...params }],
    { signal },
  )
    .then((events) => hydrateEvents({ store, events, signal }));

  const suggestions = await Promise.all([...pubkeys].map(async (pubkey) => {
    const profile = profiles.find((event) => event.pubkey === pubkey);

    return {
      source: 'global',
      account: profile ? await renderAccount(profile) : await accountFromPubkey(pubkey),
    };
  }));

  return paginated(c, grants, suggestions);
};
