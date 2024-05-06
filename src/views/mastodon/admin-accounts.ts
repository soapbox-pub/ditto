import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { nostrDate } from '@/utils.ts';

import { renderAccount } from '@/views/mastodon/accounts.ts';

/** Expects a kind 0 fully hydrated or a kind 30361 hydrated with `d_author` */
async function renderAdminAccount(event: DittoEvent) {
  const account = await renderAccount(event);

  return {
    id: account.id,
    username: event.tags.find(([name]) => name === 'name')?.[1]!,
    domain: account.acct.split('@')[1] || null,
    created_at: nostrDate(event.created_at).toISOString(),
    email: '',
    ip: null,
    ips: [],
    locale: '',
    invite_request: null,
    role: event.tags.find(([name]) => name === 'role')?.[1] || 'user',
    confirmed: true,
    approved: true,
    disabled: false,
    silenced: false,
    suspended: false,
    account,
  };
}

export { renderAdminAccount };
