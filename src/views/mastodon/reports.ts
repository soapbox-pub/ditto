import { type DittoEvent } from '@/interfaces/DittoEvent.ts';
import { accountFromPubkey, renderAccount } from '@/views/mastodon/accounts.ts';
import { nostrDate } from '@/utils.ts';
import { renderAdminAccount } from '@/views/mastodon/admin-accounts.ts';
import { renderStatus } from '@/views/mastodon/statuses.ts';

/** Expects a `reportEvent` of kind 1984 and a `profile` of kind 0 of the person being reported */
async function renderReport(reportEvent: DittoEvent, profile: DittoEvent) {
  // The category is present in both the 'e' and 'p' tag, however, it is possible to report a user without reporting a note, so it's better to get the category from the 'p' tag
  const category = reportEvent.tags.find(([name]) => name === 'p')?.[2];

  const statusIds = reportEvent.tags.filter(([name]) => name === 'e').map((tag) => tag[1]) ?? [];

  const reportedPubkey = reportEvent.tags.find(([name]) => name === 'p')?.[1];
  if (!reportedPubkey) return;

  return {
    id: reportEvent.id,
    action_taken: false,
    action_taken_at: null,
    category,
    comment: reportEvent.content,
    forwarded: false,
    created_at: nostrDate(reportEvent.created_at).toISOString(),
    status_ids: statusIds,
    rules_ids: null,
    target_account: profile ? await renderAccount(profile) : await accountFromPubkey(reportedPubkey),
  };
}

interface RenderAdminReportOpts {
  viewerPubkey?: string;
  action_taken?: boolean;
}

/** Admin-level information about a filed report.
 * Expects an event of kind 1984 fully hydrated.
 * https://docs.joinmastodon.org/entities/Admin_Report */
async function renderAdminReport(reportEvent: DittoEvent, opts: RenderAdminReportOpts) {
  const { viewerPubkey, action_taken = false } = opts;

  // The category is present in both the 'e' and 'p' tag, however, it is possible to report a user without reporting a note, so it's better to get the category from the 'p' tag
  const category = reportEvent.tags.find(([name]) => name === 'p')?.[2];

  const statuses = [];
  if (reportEvent.reported_notes) {
    for (const status of reportEvent.reported_notes) {
      statuses.push(await renderStatus(status, { viewerPubkey }));
    }
  }

  return {
    id: reportEvent.id,
    action_taken,
    action_taken_at: null,
    category,
    comment: reportEvent.content,
    forwarded: false,
    created_at: nostrDate(reportEvent.created_at).toISOString(),
    account: await renderAdminAccount(reportEvent.author as DittoEvent),
    target_account: await renderAdminAccount(reportEvent.reported_profile as DittoEvent),
    assigned_account: null,
    action_taken_by_account: null,
    statuses,
    rule: [],
  };
}

export { renderAdminReport, renderReport };
