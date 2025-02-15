import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { getTagSet } from '@/utils/tags.ts';
import { renderAdminAccount, renderAdminAccountFromPubkey } from '@/views/mastodon/admin-accounts.ts';

/** Renders an Admin::Account entity from a name request event. */
export async function renderNameRequest(event: DittoEvent) {
  const n = getTagSet(event.info?.tags ?? [], 'n');
  const [username, domain] = event.tags.find(([name]) => name === 'r')?.[1]?.split('@') ?? [];

  const adminAccount = event.author
    ? await renderAdminAccount(event.author)
    : await renderAdminAccountFromPubkey(event.pubkey);

  return {
    ...adminAccount,
    id: event.id,
    approved: n.has('approved'),
    username,
    domain,
    invite_request: event.content,
  };
}
