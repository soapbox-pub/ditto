import type { FeedSettings } from '@/contexts/AppContext';

/** Metadata for an extra (non-kind-1) content type. */
export interface ExtraKindDef {
  kind: number;
  /** Key in FeedSettings that controls sidebar visibility. */
  showKey: keyof FeedSettings;
  /** Key in FeedSettings that controls inclusion in mixed feeds. */
  feedKey: keyof FeedSettings;
  /** Human-readable label. */
  label: string;
  /** Short description. */
  description: string;
  /** Route path (without leading slash). */
  route: string;
  /** Whether this kind is addressable (30000-39999). */
  addressable: boolean;
}

/** All supported extra content kinds. */
export const EXTRA_KINDS: ExtraKindDef[] = [
  {
    kind: 34236,
    showKey: 'showVines',
    feedKey: 'feedIncludeVines',
    label: 'Vines',
    description: 'Short-form videos (kind 34236)',
    route: 'vines',
    addressable: true,
  },
  {
    kind: 1068,
    showKey: 'showPolls',
    feedKey: 'feedIncludePolls',
    label: 'Polls',
    description: 'Community polls and votes (kind 1068)',
    route: 'polls',
    addressable: false,
  },
  {
    kind: 37516,
    showKey: 'showTreasures',
    feedKey: 'feedIncludeTreasures',
    label: 'Treasures',
    description: 'Geocache listings (kind 37516)',
    route: 'treasures',
    addressable: true,
  },
  {
    kind: 3367,
    showKey: 'showColors',
    feedKey: 'feedIncludeColors',
    label: 'Colors',
    description: 'Color moment palettes (kind 3367)',
    route: 'colors',
    addressable: false,
  },
];

/** Return the kind numbers the user has opted to include in mixed feeds. */
export function getEnabledFeedKinds(feedSettings: FeedSettings): number[] {
  return EXTRA_KINDS
    .filter((def) => feedSettings[def.feedKey])
    .map((def) => def.kind);
}

/** Return all extra kind numbers (regardless of settings). */
export function getAllExtraKindNumbers(): number[] {
  return EXTRA_KINDS.map((def) => def.kind);
}
