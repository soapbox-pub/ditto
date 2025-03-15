import { paginated, paginatedList, paginationSchema } from '@ditto/mastoapi/pagination';
import { NostrFilter } from '@nostrify/nostrify';
import { matchFilter } from 'nostr-tools';

import { AppContext, AppController } from '@/app.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { getTagSet } from '@/utils/tags.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';

export const suggestionsV1Controller: AppController = async (c) => {
  const { signal } = c.var;
  const { offset, limit } = paginationSchema().parse(c.req.query());
  const suggestions = await renderV2Suggestions(c, { offset, limit }, signal);
  const accounts = suggestions.map(({ account }) => account);
  return paginatedList(c, { offset, limit }, accounts);
};

export const suggestionsV2Controller: AppController = async (c) => {
  const { signal } = c.var;
  const { offset, limit } = paginationSchema().parse(c.req.query());
  const suggestions = await renderV2Suggestions(c, { offset, limit }, signal);
  return paginatedList(c, { offset, limit }, suggestions);
};

async function renderV2Suggestions(c: AppContext, params: { offset: number; limit: number }, signal?: AbortSignal) {
  const { conf, relay, user } = c.var;
  const { offset, limit } = params;

  const pubkey = await user?.signer.getPublicKey();

  const filters: NostrFilter[] = [
    { kinds: [30382], authors: [await conf.signer.getPublicKey()], '#n': ['suggested'], limit },
    { kinds: [1985], '#L': ['pub.ditto.trends'], '#l': [`#p`], authors: [await conf.signer.getPublicKey()], limit: 1 },
  ];

  if (pubkey) {
    filters.push({ kinds: [3], authors: [pubkey], limit: 1 });
    filters.push({ kinds: [10000], authors: [pubkey], limit: 1 });
  }

  const events = await relay.query(filters, { signal });
  const adminPubkey = await conf.signer.getPublicKey();

  const [userEvents, followsEvent, mutesEvent, trendingEvent] = [
    events.filter((event) => matchFilter({ kinds: [30382], authors: [adminPubkey], '#n': ['suggested'] }, event)),
    pubkey ? events.find((event) => matchFilter({ kinds: [3], authors: [pubkey] }, event)) : undefined,
    pubkey ? events.find((event) => matchFilter({ kinds: [10000], authors: [pubkey] }, event)) : undefined,
    events.find((event) =>
      matchFilter({
        kinds: [1985],
        '#L': ['pub.ditto.trends'],
        '#l': [`#p`],
        authors: [adminPubkey],
        limit: 1,
      }, event)
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

  const profiles = await relay.query(
    [{ kinds: [0], authors, limit: authors.length }],
    { signal },
  )
    .then((events) => hydrateEvents({ ...c.var, events }));

  return Promise.all(authors.map(async (pubkey) => {
    const profile = profiles.find((event) => event.pubkey === pubkey);

    return {
      source: suggested.has(pubkey) ? 'staff' : 'global',
      account: profile ? await renderAccount(profile) : await accountFromPubkey(pubkey),
    };
  }));
}

export const localSuggestionsController: AppController = async (c) => {
  const { conf, relay, pagination, signal } = c.var;

  const grants = await relay.query(
    [{ kinds: [30360], authors: [await conf.signer.getPublicKey()], ...pagination }],
    { signal },
  );

  const pubkeys = new Set<string>();

  for (const grant of grants) {
    const pubkey = grant.tags.find(([name]) => name === 'p')?.[1];
    if (pubkey) {
      pubkeys.add(pubkey);
    }
  }

  const profiles = await relay.query(
    [{ kinds: [0], authors: [...pubkeys], search: `domain:${conf.url.host}`, ...pagination }],
    { signal },
  )
    .then((events) => hydrateEvents({ ...c.var, events }));

  const suggestions = [...pubkeys].map((pubkey) => {
    const profile = profiles.find((event) => event.pubkey === pubkey);
    if (!profile) return;

    return {
      source: 'global',
      account: renderAccount(profile),
    };
  }).filter(Boolean);

  return paginated(c, grants, suggestions);
};
