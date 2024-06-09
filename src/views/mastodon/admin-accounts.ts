import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getTagSet } from '@/utils/tags.ts';

/** Expects a kind 0 fully hydrated */
async function renderAdminAccount(event: DittoEvent) {
  const account = await renderAccount(event);
  const names = getTagSet(event.user?.tags ?? [], 'n');

  let role = 'user';

  if (names.has('admin')) {
    role = 'admin';
  }
  if (names.has('moderator')) {
    role = 'moderator';
  }

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
    role,
    confirmed: true,
    approved: true,
    disabled: names.has('disabled'),
    silenced: names.has('silenced'),
    suspended: names.has('suspended'),
    sensitized: names.has('sensitized'),
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
