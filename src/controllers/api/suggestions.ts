import { NStore } from '@nostrify/nostrify';

import { AppController } from '@/app.ts';
import { Conf } from '@/config.ts';
import { getTagSet } from '@/tags.ts';
import { hydrateEvents } from '@/storages/hydrate.ts';
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

  const pubkeys = [...getTagSet(follows?.tags ?? [], 'p')];

  const profiles = await store.query(
    [{ kinds: [1], authors: pubkeys }],
    { signal },
  )
    .then((events) => hydrateEvents({ events, storage: store, signal }));

  const accounts = await Promise.all(pubkeys.map((pubkey) => {
    const profile = profiles.find((event) => event.pubkey === pubkey);
    return profile ? renderAccount(profile) : accountFromPubkey(pubkey);
  }));

  return accounts.filter(Boolean);
}
