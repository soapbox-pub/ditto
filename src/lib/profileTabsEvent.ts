/**
 * Kind 16769 — Profile Tabs
 *
 * Replaceable event. One per user. Each tab is a `tab` tag:
 *   ["tab", "<label>", "<filtersJSON>"]
 *
 * Order of tags defines display order.
 */
import type { NostrEvent } from '@nostrify/nostrify';
import type { SavedFeedFilters } from '@/contexts/AppContext';

export const PROFILE_TABS_KIND = 16769;

export interface ProfileTab {
  label: string;
  filters: SavedFeedFilters;
}

const DEFAULT_FILTERS: SavedFeedFilters = {
  query: '',
  mediaType: 'all',
  language: 'global',
  platform: 'nostr',
  kindFilter: 'all',
  customKindText: '',
  authorScope: 'anyone',
  authorPubkeys: [],
  sort: 'recent',
};

/** Parse a kind 16769 event into an array of ProfileTab. Returns [] on any error. */
export function parseProfileTabs(event: NostrEvent): ProfileTab[] {
  if (event.kind !== PROFILE_TABS_KIND) return [];

  const tabs: ProfileTab[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'tab' || tag.length < 3) continue;
    const label = tag[1];
    try {
      const raw = JSON.parse(tag[2]);
      const filters: SavedFeedFilters = { ...DEFAULT_FILTERS, ...raw };
      if (label) tabs.push({ label, filters });
    } catch {
      // skip malformed tab
    }
  }
  return tabs;
}

/** Build tags for a kind 16769 event from an array of ProfileTab. */
export function buildProfileTabsTags(tabs: ProfileTab[]): string[][] {
  const tags: string[][] = [
    ['alt', 'Custom profile tabs'],
  ];
  for (const tab of tabs) {
    tags.push(['tab', tab.label, JSON.stringify(tab.filters)]);
  }
  return tags;
}
