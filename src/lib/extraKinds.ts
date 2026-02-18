import type { FeedSettings } from '@/contexts/AppContext';

/** A sub-kind that lives under a parent ExtraKindDef. */
export interface SubKindDef {
  kind: number;
  /** Key in FeedSettings that controls visibility within the parent page. */
  showKey: keyof FeedSettings;
  /** Key in FeedSettings that controls inclusion in mixed feeds. */
  feedKey: keyof FeedSettings;
  /** Human-readable label. */
  label: string;
  /** Short description. */
  description: string;
  /** Whether this kind is addressable (30000-39999). */
  addressable: boolean;
}

/** Metadata for an extra (non-kind-1) content type. */
export interface ExtraKindDef {
  kind: number;
  /** Key in FeedSettings that controls sidebar visibility. */
  showKey: keyof FeedSettings;
  /** Key in FeedSettings that controls inclusion in mixed feeds (only for entries without subKinds). */
  feedKey?: keyof FeedSettings;
  /** Human-readable label. */
  label: string;
  /** Short description. */
  description: string;
  /** Route path (without leading slash). */
  route: string;
  /** Whether this kind is addressable (30000-39999). */
  addressable: boolean;
  /** Optional sub-kinds that break this entry into granular options. */
  subKinds?: SubKindDef[];
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
    label: 'Treasures',
    description: 'Geocaches & found logs',
    route: 'treasures',
    addressable: true,
    subKinds: [
      {
        kind: 37516,
        showKey: 'showTreasureGeocaches',
        feedKey: 'feedIncludeTreasureGeocaches',
        label: 'Geocaches',
        description: 'Geocache listings (kind 37516)',
        addressable: true,
      },
      {
        kind: 7516,
        showKey: 'showTreasureFoundLogs',
        feedKey: 'feedIncludeTreasureFoundLogs',
        label: 'Found Logs',
        description: 'Geocache found logs (kind 7516)',
        addressable: false,
      },
    ],
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
  {
    kind: 39089,
    showKey: 'showPacks',
    feedKey: 'feedIncludePacks',
    label: 'Follow Packs',
    description: 'Starter packs / follow sets (kind 39089)',
    route: 'packs',
    addressable: true,
  },
];

/** Return the kind numbers the user has opted to include in mixed feeds. */
export function getEnabledFeedKinds(feedSettings: FeedSettings): number[] {
  const kinds: number[] = [];

  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        if (feedSettings[sub.feedKey]) {
          kinds.push(sub.kind);
        }
      }
    } else if (def.feedKey && feedSettings[def.feedKey]) {
      kinds.push(def.kind);
    }
  }

  return kinds;
}

/** Return the kinds enabled for a specific extra-kind page (respecting sub-kind toggles). */
export function getPageKinds(def: ExtraKindDef, feedSettings: FeedSettings): number[] {
  if (!def.subKinds) return [def.kind];

  return def.subKinds
    .filter((sub) => feedSettings[sub.showKey])
    .map((sub) => sub.kind);
}

/** Return all extra kind numbers (regardless of settings). */
export function getAllExtraKindNumbers(): number[] {
  const kinds: number[] = [];

  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        if (!kinds.includes(sub.kind)) kinds.push(sub.kind);
      }
    } else {
      kinds.push(def.kind);
    }
  }

  return kinds;
}
