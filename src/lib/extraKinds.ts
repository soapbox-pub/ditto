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

/** An external site where users can create or participate in a specific kind. */
export interface ExtraKindSite {
  /** Full URL to the site. */
  url: string;
  /** Display name override. Defaults to the first segment of the hostname, capitalized. */
  name?: string;
}

/** Section labels for grouping extra kinds in settings UI. */
export type ExtraKindSection = 'feed' | 'media' | 'social' | 'whimsy';

/** Display labels for each section. */
export const SECTION_LABELS: Record<ExtraKindSection, string> = {
  feed: 'Feed',
  media: 'Media',
  social: 'Social',
  whimsy: 'Whimsy',
};

/** Ordered list of sections for the "Other Stuff" settings UI. */
export const SECTION_ORDER: ExtraKindSection[] = ['media', 'social', 'whimsy'];

/** Metadata for an extra (non-kind-1) content type. */
export interface ExtraKindDef {
  kind: number;
  /** Unique identifier for this content type. Used in sidebar ordering and icon maps. */
  id: string;
  /** Key in FeedSettings that controls sidebar visibility (omit for feed-only items). */
  showKey?: keyof FeedSettings;
  /** Key in FeedSettings that controls inclusion in mixed feeds (only for entries without subKinds). */
  feedKey?: keyof FeedSettings;
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
    feedKey: 'feedIncludePosts',
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
    label: 'Reposts',
    description: 'Shared posts from others',
    addressable: false,
    section: 'feed',
    feedOnly: true,
  },
  {
    kind: 16,
    id: 'generic-reposts',
    feedKey: 'feedIncludeReposts',
    label: 'Generic Reposts',
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
    sites: [{ url: 'https://zap.stream', name: 'zap.stream' }],
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
    label: 'Vines',
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
    id: 'emoji-packs',
    showKey: 'showEmojiPacks',
    feedKey: 'feedIncludeEmojiPacks',
    label: 'Emoji Packs',
    description: 'Custom emoji collections (NIP-30)',
    route: 'emoji-packs',
    addressable: true,
    section: 'social',
    blurb: 'Custom emoji packs for reactions, posts, and profiles. Browse, collect, and use custom emojis from the Nostr community.',
    sites: [{ url: 'https://emojiverse.shakespeare.wtf', name: 'EmojiVerse' }],
  },
  {
    kind: 37516,
    id: 'treasures',
    showKey: 'showTreasures',
    label: 'Treasures',
    description: 'Geocaches & found logs',
    route: 'treasures',
    addressable: true,
    section: 'whimsy',
    blurb: 'Real-world geocaching. Hide treasures outside, find others, and log your discoveries.',
    sites: [{ url: 'https://treasures.to' }],
    subKinds: [
      {
        kind: 37516,
        showKey: 'showTreasureGeocaches',
        feedKey: 'feedIncludeTreasureGeocaches',
        label: 'Geocaches',
        description: 'Geocache listings',
        addressable: true,
      },
      {
        kind: 7516,
        showKey: 'showTreasureFoundLogs',
        feedKey: 'feedIncludeTreasureFoundLogs',
        label: 'Found Logs',
        description: 'Geocache found logs',
        addressable: false,
      },
    ],
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
