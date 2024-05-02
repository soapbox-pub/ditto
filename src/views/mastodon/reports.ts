import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { renderAccount } from '@/views/mastodon/accounts.ts';
import { nostrDate } from '@/utils.ts';

interface reportsOpts {
  viewerPubkey?: string;
}

/** Expects a `reportEvent` of kind 1984 and a `targetAccout` of kind 0 of the person being reported */
async function renderReports(reportEvent: DittoEvent, targetAccout: DittoEvent, _opts: reportsOpts) {
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
    target_account: await renderAccount(targetAccout),
  };
}

export { renderReports };
