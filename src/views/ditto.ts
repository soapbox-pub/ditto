import { DittoEvent } from '@/interfaces/DittoEvent.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { getTagSet } from '@/utils/tags.ts';

export async function renderNameRequest(event: DittoEvent) {
  const n = getTagSet(event.info?.tags ?? [], 'n');

  let approvalStatus = 'pending';

  if (n.has('approved')) {
    approvalStatus = 'approved';
  }
  if (n.has('rejected')) {
    approvalStatus = 'rejected';
  }

  return {
    id: event.id,
    account: event.author ? await renderAccount(event.author) : accountFromPubkey(event.pubkey),
    name: event.tags.find(([name]) => name === 'r')?.[1] || '',
    reason: event.content,
    approval_status: approvalStatus,
    created_at: new Date(event.created_at * 1000).toISOString(),
  };
}
