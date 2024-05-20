import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { type DittoEvent } from '@/interfaces/DittoEvent.ts';

/** Expects a kind 0 fully hydrated */
async function renderAdminAccount(event: DittoEvent) {
  const account = await renderAccount(event);

  return {
    id: account.id,
    username: account.username,
    domain: account.acct.split('@')[1] || null,
    created_at: account.created_at,
    email: '',
    ip: null,
    ips: [],
    locale: '',
    invite_request: null,
    role: event.tags.find(([name]) => name === 'role')?.[1],
    confirmed: true,
    approved: true,
    disabled: false,
    silenced: false,
    suspended: false,
    account,
  };
}

/** Expects a target pubkey */
async function renderAdminAccountFromPubkey(pubkey: string) {
  const account = await accountFromPubkey(pubkey);

  return {
    id: account.id,
    username: account.username,
    domain: account.acct.split('@')[1] || null,
    created_at: account.created_at,
    email: '',
    ip: null,
    ips: [],
    locale: '',
    invite_request: null,
    role: 'user',
    confirmed: true,
    approved: true,
    disabled: false,
    silenced: false,
    suspended: false,
    account,
  };
}

export { renderAdminAccount, renderAdminAccountFromPubkey };
