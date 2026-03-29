import type { FeedSettings } from '@/contexts/AppContext';
import type { ComponentType } from 'react';
import { Globe, GitPullRequestArrow, MessageSquareMore, CircleAlert } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';

/** A sub-kind that lives under a parent ExtraKindDef. */
export interface SubKindDef {
  kind: number;
  /** Key in FeedSettings that controls visibility within the parent page. */
  showKey: keyof FeedSettings;
  /** Key in FeedSettings that controls inclusion in mixed feeds. */
  feedKey: keyof FeedSettings;
  /** Additional kind numbers to include alongside `kind` when the feed toggle is on. */
  extraFeedKinds?: number[];
  /** Human-readable label. */
  label: string;
  /** Short description. */
  description: string;
  /** Whether this kind is addressable (30000-39999). */
  addressable?: boolean;
}

/** An external site where users can create or participate in a specific kind. */
export interface ExtraKindSite {
  /** Full URL to the site. */
  url: string;
  /** Display name override. Defaults to the first segment of the hostname, capitalized. */
  name?: string;
}

/** Section labels for grouping extra kinds in settings UI. */
export type ExtraKindSection = 'feed' | 'media' | 'social' | 'development' | 'whimsy';

/** Display labels for each section. */
export const SECTION_LABELS: Record<ExtraKindSection, string> = {
  feed: 'Feed',
  media: 'Media',
  social: 'Social',
  development: 'Development',
  whimsy: 'Whimsy',
};

/** Ordered list of sections for the "Other Stuff" settings UI. */
export const SECTION_ORDER: ExtraKindSection[] = ['media', 'social', 'development', 'whimsy'];

/** Metadata for an extra (non-kind-1) content type. */
export interface ExtraKindDef {
  kind: number;
  /** Unique identifier for this content type. Used in sidebar ordering and icon maps. */
  id: string;
  /** Key in FeedSettings that controls sidebar visibility (omit for feed-only items). */
  showKey?: keyof FeedSettings;
  /** Key in FeedSettings that controls inclusion in mixed feeds (only for entries without subKinds). */
  feedKey?: keyof FeedSettings;
  /** Additional kind numbers to include alongside `kind` when the feed toggle is on. */
  extraFeedKinds?: number[];
  /** Human-readable label. */
  label: string;
  /** Short description. */
  description: string;
  /** Route path (without leading slash). Omit for feed-only items with no dedicated page. */
  route?: string;
  /** Whether this kind is addressable (30000-39999). */
  addressable: boolean;
  /** Optional sub-kinds that break this entry into granular options. */
  subKinds?: SubKindDef[];
  /** Section grouping for the settings UI. */
  section: ExtraKindSection;
  /** If true, this entry only has a feed toggle (no sidebar toggle). */
  feedOnly?: boolean;
  /** Longer, whimsical blurb shown in the info modal. */
  blurb?: string;
  /** External sites where users can create or participate in this kind of content. */
  sites?: ExtraKindSite[];
}

/** All supported extra content kinds, ordered by section (feed → media → social → whimsy). */
export const EXTRA_KINDS: ExtraKindDef[] = [
  // Feed (core content types — feed toggle only, no sidebar page)
  {
    kind: 1,
    id: 'posts',
    feedKey: 'feedIncludePosts',
    label: 'Posts',
    description: 'Short text notes',
    addressable: false,
    section: 'feed',
    feedOnly: true,
  },
  {
    kind: 1111,
    id: 'comments',
    feedKey: 'feedIncludeComments',
    label: 'Comments',
    description: 'NIP-22 comments on posts and external content',
    addressable: false,
    section: 'feed',
    feedOnly: true,
  },
  {
    kind: 6,
    id: 'reposts',
    feedKey: 'feedIncludeReposts',
    label: 'Reposted Notes',
    description: 'Shared posts from others',
    addressable: false,
    section: 'feed',
    feedOnly: true,
  },
  {
    kind: 16,
    id: 'generic-reposts',
    feedKey: 'feedIncludeGenericReposts',
    label: 'Reposted Other Content',
    description: 'Shared non-text-note posts from others',
    addressable: false,
    section: 'feed',
    feedOnly: true,
  },
  {
    kind: 30023,
    id: 'articles',
    showKey: 'showArticles',
    feedKey: 'feedIncludeArticles',
    label: 'Articles',
    description: 'Long-form blog posts',
    route: 'articles',
    addressable: true,
    section: 'feed',
    blurb: 'Blog posts, essays, and guides. Write and publish from a dedicated editor.',
    sites: [{ url: 'https://inkwell.shakespeare.wtf' }],
  },
  // Media
  {
    kind: 20,
    id: 'photos',
    showKey: 'showPhotos',
    feedKey: 'feedIncludePhotos',
    label: 'Photos',
    description: 'Picture-first posts (NIP-68)',
    route: 'photos',
    addressable: false,
    section: 'media',
    blurb: 'Instagram-style photo posts. Share images with captions and tags.',
    sites: [{ url: 'https://nostr.build', name: 'nostr.build' }],
  },
  {
    kind: 21,
    id: 'videos',
    showKey: 'showVideos',
    label: 'Videos',
    description: 'Video posts (NIP-71 kinds 21 & 22) and live streams',
    route: 'videos',
    addressable: false,
    section: 'media',
    blurb: 'Watch and discover videos and live streams in a YouTube/Twitch-style interface.',
    sites: [{ url: 'https://zap.stream', name: 'zap.stream' }, { url: 'https://vidstr.shakespeare.wtf', name: 'Vidstr' }],
    subKinds: [
      {
        kind: 21,
        showKey: 'showVideos',
        feedKey: 'feedIncludeNormalVideos',
        label: 'Videos',
        description: 'Normal videos (NIP-71 kind 21)',
        addressable: false,
      },
      {
        kind: 22,
        showKey: 'showVideos',
        feedKey: 'feedIncludeShortVideos',
        label: 'Short Videos',
        description: 'Short vertical videos (NIP-71 kind 22)',
        addressable: false,
      },
    ],
  },
  {
    kind: 1222,
    id: 'voice',
    feedKey: 'feedIncludeVoiceMessages',
    label: 'Voice Messages',
    description: 'Short audio voice messages (NIP-A0)',
    addressable: false,
    section: 'media',
    feedOnly: true,
    blurb: 'Record and share short voice messages, up to 60 seconds long.',
  },
  {
    kind: 34236,
    id: 'vines',
    showKey: 'showVines',
    feedKey: 'feedIncludeVines',
    label: 'Divines',
    description: 'Short-form videos',
    route: 'vines',
    addressable: true,
    section: 'media',
    blurb: 'Short video clips. Record and share from a dedicated app.',
    sites: [{ url: 'https://divine.video' }],
  },
  {
    kind: 36787,
    id: 'music',
    showKey: 'showMusic',
    label: 'Music',
    description: 'Music tracks and playlists',
    route: 'music',
    addressable: true,
    section: 'media',
    blurb: 'Discover and listen to music tracks and playlists shared on Nostr. Upload music and create playlists from a dedicated music app.',
    sites: [{ url: 'https://nodecast.xyz' }],
    subKinds: [
      {
        kind: 36787,
        showKey: 'showMusic',
        feedKey: 'feedIncludeMusicTracks',
        label: 'Tracks',
        description: 'Music tracks (kind 36787)',
        addressable: true,
      },
      {
        kind: 34139,
        showKey: 'showMusic',
        feedKey: 'feedIncludeMusicPlaylists',
        label: 'Playlists',
        description: 'Music playlists (kind 34139)',
        addressable: true,
      },
    ],
  },
  {
    kind: 30054,
    id: 'podcasts',
    showKey: 'showPodcasts',
    label: 'Podcasts',
    description: 'Podcast episodes and trailers',
    route: 'podcasts',
    addressable: true,
    section: 'media',
    blurb: 'Listen to podcast episodes and trailers shared on Nostr.',
    subKinds: [
      {
        kind: 30054,
        showKey: 'showPodcasts',
        feedKey: 'feedIncludePodcastEpisodes',
        label: 'Episodes',
        description: 'Podcast episodes (kind 30054)',
        addressable: true,
      },
      {
        kind: 30055,
        showKey: 'showPodcasts',
        feedKey: 'feedIncludePodcastTrailers',
        label: 'Trailers',
        description: 'Podcast trailers (kind 30055)',
        addressable: true,
      },
    ],
  },
  // Social
  {
    kind: 30315,
    id: 'statuses',
    showKey: 'showUserStatuses',
    label: 'User Statuses',
    description: 'Live statuses on profiles and posts (NIP-38)',
    addressable: true,
    section: 'social',
    feedOnly: true,
    blurb: 'See what people are up to — statuses appear next to names on posts and on profile pages.',
  },
  {
    kind: 31923,
    id: 'events',
    showKey: 'showEvents',
    feedKey: 'feedIncludeEvents',
    extraFeedKinds: [31922],
    label: 'Events',
    description: 'Calendar events and meetups (NIP-52)',
    route: 'events',
    addressable: true,
    section: 'social',
    blurb: 'Events and meetups on Nostr. RSVP and see who else is going. Create and manage events on Plektos.',
    sites: [{ url: 'https://plektos.app', name: 'Plektos' }],
  },
  {
    kind: 1063,
    id: 'webxdc',
    showKey: 'showWebxdc',
    feedKey: 'feedIncludeWebxdc',
    label: 'Webxdc',
    description: 'Sandboxed HTML5 apps shared over Nostr',
    route: 'webxdc',
    addressable: false,
    section: 'social',
    blurb: 'Webxdc apps are sandboxed HTML5 mini-apps (.xdc files) shared over Nostr. Play games, run tools, and collaborate with others.',
    sites: [{ url: 'https://webxdc.org', name: 'webxdc.org' }],
  },
  {
    kind: 36767,
    id: 'themes',
    showKey: 'showProfileThemes',
    label: 'Themes',
    description: 'Custom UI themes & updates',
    route: 'themes',
    addressable: true,
    section: 'social',
    blurb: 'Shareable custom UI themes. Create your own theme or browse themes shared by others.',
    subKinds: [
      {
        kind: 36767,
        showKey: 'showThemeDefinitions',
        feedKey: 'feedIncludeThemeDefinitions',
        label: 'Theme Definitions',
        description: 'Shareable named themes',
        addressable: true,
      },
      {
        kind: 16767,
        showKey: 'showProfileThemeUpdates',
        feedKey: 'feedIncludeProfileThemeUpdates',
        label: 'Profile Themes',
        description: 'Profile theme updates',
        addressable: false,
      },
    ],
  },
  {
    kind: 1068,
    id: 'polls',
    showKey: 'showPolls',
    feedKey: 'feedIncludePolls',
    label: 'Polls',
    description: 'Community polls and votes',
    route: 'polls',
    addressable: false,
    section: 'social',
    blurb: 'Ask a question, let people vote. Create polls from a polling app.',
    sites: [{ url: 'https://pollerama.fun' }],
  },
  {
    kind: 39089,
    id: 'packs',
    showKey: 'showPacks',
    feedKey: 'feedIncludePacks',
    label: 'Follow Packs',
    description: 'Curated follow recommendations',
    route: 'packs',
    addressable: true,
    section: 'social',
    blurb: 'Curated lists of people to follow. Browse or create your own.',
    sites: [{ url: 'https://following.space', name: 'following.space' }, { url: 'https://following.party', name: 'following.party' }],
  },
  {
    kind: 62,
    id: 'vanish',
    feedKey: 'feedIncludeVanish',
    label: 'Requests to Vanish',
    description: 'NIP-62 account erasure announcements',
    addressable: false,
    section: 'social',
    feedOnly: true,
    blurb: 'When someone permanently leaves Nostr, their Request to Vanish event signals the end of their identity on the network.',
  },
  // Whimsy
  {
    kind: 3367,
    id: 'colors',
    showKey: 'showColors',
    feedKey: 'feedIncludeColors',
    label: 'Color Moments',
    description: 'Color moment palettes',
    route: 'colors',
    addressable: false,
    section: 'whimsy',
    blurb: 'Share your mood as a color palette. Pick colors that match the moment.',
    sites: [{ url: 'https://espy.you' }],
  },
  {
    kind: 37381,
    id: 'decks',
    showKey: 'showDecks',
    feedKey: 'feedIncludeDecks',
    label: 'Magic Decks',
    description: 'Magic: The Gathering deck lists',
    route: 'decks',
    addressable: true,
    section: 'whimsy',
    blurb: 'Magic: The Gathering deck lists. Build and share decks with other players.',
    sites: [{ url: 'https://surveil.cards' }],
  },
  {
    kind: 30030,
    id: 'emojis',
    showKey: 'showEmojiPacks',
    feedKey: 'feedIncludeEmojiPacks',
    label: 'Emoji Packs',
    description: 'Custom emoji collections (NIP-30)',
    route: 'emojis',
    addressable: true,
    section: 'social',
    blurb: 'Custom emoji packs for reactions, posts, and profiles. Browse, collect, and use custom emojis from the Nostr community.',
  },
  {
    kind: 30009,
    id: 'badges',
    showKey: 'showBadges',
    label: 'Badges',
    description: 'Badges and awards (NIP-58)',
    route: 'badges',
    addressable: true,
    section: 'whimsy',
    blurb: 'Discover badges created on Nostr. Badge issuers award them for recognition, participation, or appreciation.',
    subKinds: [
      {
        kind: 30009,
        showKey: 'showBadgeDefinitions',
        feedKey: 'feedIncludeBadgeDefinitions',
        label: 'Badge Definitions',
        description: 'Badge definitions (kind 30009)',
        addressable: true,
      },
      {
        kind: 10008,
        showKey: 'showProfileBadges',
        feedKey: 'feedIncludeProfileBadges',
        label: 'Profile Badges',
        description: 'Accepted profile badges (kind 10008)',
        extraFeedKinds: [30008], // legacy kind for backwards compatibility
      },
    ],
  },
  {
    kind: 37516,
    id: 'treasures',
    showKey: 'showTreasures',
    label: 'Treasures',
    description: 'Treasures & found logs',
    route: 'treasures',
    addressable: true,
    section: 'whimsy',
    blurb: 'Real-world treasure hunting. Hide treasures outside, find others, and log your discoveries.',
    sites: [{ url: 'https://treasures.to' }],
    subKinds: [
      {
        kind: 37516,
        showKey: 'showTreasureGeocaches',
        feedKey: 'feedIncludeTreasureGeocaches',
        label: 'Treasures',
        description: 'Treasure listings',
        addressable: true,
      },
      {
        kind: 7516,
        showKey: 'showTreasureFoundLogs',
        feedKey: 'feedIncludeTreasureFoundLogs',
        label: 'Found Logs',
        description: 'Treasure found logs',
        addressable: false,
      },
    ],
  },
  // Development
  {
    kind: 30617,
    id: 'development',
    showKey: 'showDevelopment',
    feedKey: 'feedIncludeDevelopment',
    extraFeedKinds: [1617, 1618, 30817, 15128, 35128, 32267],
    label: 'Development',
    description: 'Git repos, patches, PRs, nsites, apps, and custom NIPs',
    route: 'development',
    addressable: true,
    section: 'development',
    blurb: 'Nostr-native git repositories, patches, pull requests, nsite deployments, custom NIPs, and published applications.',
    sites: [{ url: 'https://gitworkshop.dev', name: 'Gitworkshop' }, { url: 'https://nostrhub.io', name: 'NostrHub' }],
  },
];

/** Lookup an ExtraKindDef by its `id` field. */
export function getExtraKindDef(id: string): ExtraKindDef | undefined {
  return EXTRA_KINDS.find((d) => d.id === id);
}

/** Entries rendered in the "Notes" section (Posts, Reposts, Articles). */
export const FEED_KINDS: ExtraKindDef[] = EXTRA_KINDS.filter((def) => def.section === 'feed');

/** Return the kind numbers the user has opted to include in mixed feeds. */
export function getEnabledFeedKinds(feedSettings: FeedSettings): number[] {
  const kinds: number[] = [];

  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        if (feedSettings[sub.feedKey]) {
          kinds.push(sub.kind);
          if (sub.extraFeedKinds) {
            kinds.push(...sub.extraFeedKinds);
          }
        }
      }
    } else if (def.feedKey && feedSettings[def.feedKey]) {
      kinds.push(def.kind);
      if (def.extraFeedKinds) {
        kinds.push(...def.extraFeedKinds);
      }
    }
  }

  return kinds;
}

/** Return the kinds enabled for a specific extra-kind page (respecting sub-kind toggles). */
export function getPageKinds(def: ExtraKindDef, feedSettings: FeedSettings): number[] {
  if (!def.subKinds) return [def.kind];

  return def.subKinds
    .filter((sub) => feedSettings[sub.showKey])
    .flatMap((sub) => sub.extraFeedKinds ? [sub.kind, ...sub.extraFeedKinds] : [sub.kind]);
}

/**
 * Specific labels for kinds that don't have their own top-level ExtraKindDef.
 * These are kinds buried in `extraFeedKinds` arrays or otherwise needing
 * a label more specific than their parent category.
 */
const KIND_SPECIFIC_LABELS: Record<number, string> = {
  6: 'repost',
  7: 'reaction',
  16: 'repost',
  1617: 'patch',
  1618: 'patch comment',
  15128: 'nsite',
  35128: 'nsite',
  30008: 'profile badges',
  30817: 'repository issue',
  32267: 'app',
  30063: 'release',
};

/**
 * Specific icons for kinds that need a different icon than their parent category.
 */
const KIND_SPECIFIC_ICONS: Partial<Record<number, ComponentType<{ className?: string }>>> = {
  6: RepostIcon,
  16: RepostIcon,
  1617: GitPullRequestArrow,
  1618: MessageSquareMore,
  15128: Globe,
  35128: Globe,
  30817: CircleAlert,
};

/**
 * Get a human-readable label for a specific kind number.
 * Resolution order: subKind label → KIND_SPECIFIC_LABELS → direct def label.
 * Returns undefined if the kind is completely unknown.
 */
export function getKindLabel(kind: number): string | undefined {
  // Check subKinds first (they carry their own label)
  for (const def of EXTRA_KINDS) {
    const sub = def.subKinds?.find((s) => s.kind === kind);
    if (sub) return sub.label.toLowerCase();
  }
  // Check specific overrides (extraFeedKinds items, etc.)
  if (KIND_SPECIFIC_LABELS[kind]) return KIND_SPECIFIC_LABELS[kind];
  // Check top-level def
  const def = EXTRA_KINDS.find((d) => d.kind === kind);
  if (def) return def.label.toLowerCase();
  return undefined;
}

/** Map from kind number to ExtraKindDef id, for quick icon lookup. */
const KIND_TO_ID = new Map<number, string>();
for (const def of EXTRA_KINDS) {
  KIND_TO_ID.set(def.kind, def.id);
  if (def.subKinds) {
    for (const sub of def.subKinds) {
      if (!KIND_TO_ID.has(sub.kind)) {
        KIND_TO_ID.set(sub.kind, def.id);
      }
      if (sub.extraFeedKinds) {
        for (const k of sub.extraFeedKinds) {
          if (!KIND_TO_ID.has(k)) {
            KIND_TO_ID.set(k, def.id);
          }
        }
      }
    }
  }
  if (def.extraFeedKinds) {
    for (const k of def.extraFeedKinds) {
      if (!KIND_TO_ID.has(k)) {
        KIND_TO_ID.set(k, def.id);
      }
    }
  }
}

/** Get the sidebar/content-type ID for a given kind number, if any. */
export function getKindId(kind: number): string | undefined {
  return KIND_TO_ID.get(kind);
}

/**
 * Get the icon component for a given kind number.
 * Checks KIND_SPECIFIC_ICONS first, then falls back to the parent def's icon via CONTENT_KIND_ICONS.
 * Returns undefined if no icon mapping exists (caller provides fallback).
 */
export function getKindIcon(kind: number): ComponentType<{ className?: string }> | undefined {
  if (KIND_SPECIFIC_ICONS[kind]) return KIND_SPECIFIC_ICONS[kind];
  const id = KIND_TO_ID.get(kind);
  if (!id) return undefined;
  return CONTENT_KIND_ICONS[id];
}

/** Return all extra kind numbers (regardless of settings). */
export function getAllExtraKindNumbers(): number[] {
  const kinds: number[] = [];

  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        if (!kinds.includes(sub.kind)) kinds.push(sub.kind);
        if (sub.extraFeedKinds) {
          for (const k of sub.extraFeedKinds) {
            if (!kinds.includes(k)) kinds.push(k);
          }
        }
      }
    } else {
      kinds.push(def.kind);
    }
  }

  return kinds;
}
