import { NStore } from '@nostrify/nostrify';

import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { nostrDate } from '@/utils.ts';
import { renderAdminAccount, renderAdminAccountFromPubkey } from '@/views/mastodon/admin-accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';
import { getTagSet } from '@/utils/tags.ts';

/** Expects a `reportEvent` of kind 1984 and a `profile` of kind 0 of the person being reported */
function renderReport(event: DittoEvent) {
  // The category is present in both the 'e' and 'p' tag, however, it is possible to report a user without reporting a note, so it's better to get the category from the 'p' tag
  const category = event.tags.find(([name]) => name === 'p')?.[2];
  const statusIds = event.tags.filter(([name]) => name === 'e').map((tag) => tag[1]) ?? [];
  const reportedPubkey = event.tags.find(([name]) => name === 'p')?.[1];
  if (!reportedPubkey) return;

  return {
    id: event.id,
    action_taken: false,
    action_taken_at: null,
    category,
    comment: event.content,
    forwarded: false,
    created_at: nostrDate(event.created_at).toISOString(),
    status_ids: statusIds,
    rules_ids: null,
    target_account: event.reported_profile ? renderAccount(event.reported_profile) : accountFromPubkey(reportedPubkey),
  };
}

interface RenderAdminReportOpts {
  viewerPubkey?: string;
}

/** Admin-level information about a filed report.
 * Expects an event of kind 1984 fully hydrated.
 * https://docs.joinmastodon.org/entities/Admin_Report */
async function renderAdminReport(store: NStore, event: DittoEvent, opts: RenderAdminReportOpts) {
  const { viewerPubkey } = opts;

  // The category is present in both the 'e' and 'p' tag, however, it is possible to report a user without reporting a note, so it's better to get the category from the 'p' tag
  const category = event.tags.find(([name]) => name === 'p')?.[2];

  const statuses = [];
  if (event.reported_notes) {
    for (const status of event.reported_notes) {
      statuses.push(await renderStatus(store, status, { viewerPubkey }));
    }
  }

  const reportedPubkey = event.tags.find(([name]) => name === 'p')?.[1];
  if (!reportedPubkey) {
    return;
  }

  const names = getTagSet(event.info?.tags ?? [], 'n');

  return {
    id: event.id,
    action_taken: names.has('closed'),
    action_taken_at: null,
    category,
    comment: event.content,
    forwarded: false,
    created_at: nostrDate(event.created_at).toISOString(),
    account: event.author ? await renderAdminAccount(event.author) : await renderAdminAccountFromPubkey(event.pubkey),
    target_account: event.reported_profile
      ? await renderAdminAccount(event.reported_profile)
      : await renderAdminAccountFromPubkey(reportedPubkey),
    assigned_account: null,
    action_taken_by_account: null,
    statuses,
    rule: [],
  };
}

export { renderAdminReport, renderReport };
