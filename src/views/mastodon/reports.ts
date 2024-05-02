import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { nostrDate } from '@/utils.ts';

/** Expects a `reportEvent` of kind 1984 and a `profile` of kind 0 of the person being reported */
async function renderReport(reportEvent: DittoEvent, profile: DittoEvent) {
  const {
    account_id,
    status_ids,
    comment,
    forward,
    category,
  } = JSON.parse(reportEvent.content);

  return {
    id: account_id,
    action_taken: false,
    action_taken_at: null,
    category,
    comment,
    forwarded: forward,
    created_at: nostrDate(reportEvent.created_at).toISOString(),
    status_ids,
    rules_ids: null,
    target_account: profile ? await renderAccount(profile) : await accountFromPubkey(account_id),
  };
}

export { renderReport };
