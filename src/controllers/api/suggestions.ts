import { NStore } from '@nostrify/nostrify';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
import { getTagSet } from '@/utils/tags.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';

export const suggestionsV1Controller: AppController = async (c) => {
  const store = c.get('store');
  const signal = c.req.raw.signal;
  const accounts = await renderSuggestedAccounts(store, signal);

  return c.json(accounts);
};

export const suggestionsV2Controller: AppController = async (c) => {
  const store = c.get('store');
  const signal = c.req.raw.signal;
  const accounts = await renderSuggestedAccounts(store, signal);

  const suggestions = accounts.map((account) => ({
    source: 'staff',
    account,
  }));

  return c.json(suggestions);
};

async function renderSuggestedAccounts(store: NStore, signal?: AbortSignal) {
  const [follows] = await store.query(
    [{ kinds: [3], authors: [Conf.pubkey], limit: 1 }],
    { signal },
  );

  // TODO: pagination
  const pubkeys = [...getTagSet(follows?.tags ?? [], 'p')].slice(0, 20);

  const profiles = await store.query(
    [{ kinds: [0], authors: pubkeys, limit: pubkeys.length }],
    { signal },
  )
    .then((events) => hydrateEvents({ events, store, signal }));

  const accounts = await Promise.all(pubkeys.map((pubkey) => {
    const profile = profiles.find((event) => event.pubkey === pubkey);
    return profile ? renderAccount(profile) : accountFromPubkey(pubkey);
  }));

  return accounts.filter(Boolean);
}
