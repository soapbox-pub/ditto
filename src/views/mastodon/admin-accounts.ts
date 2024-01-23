import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { nostrDate } from '@/utils.ts';

import { accountFromPubkey, renderAccount } from './accounts.ts';

async function renderAdminAccount(event: DittoEvent) {
  const d = event.tags.find(([name]) => name === 'd')?.[1]!;
  const account = event.d_author ? await renderAccount({ ...event.d_author, user: event }) : await accountFromPubkey(d);

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
