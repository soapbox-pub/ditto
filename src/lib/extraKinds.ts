import type { FeedSettings } from '@/contexts/AppContext';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ComponentType } from 'react';
import { Bird, CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleX, GitBranch, GitPullRequest, GitPullRequestArrow, Globe, Heart, Stars, UserCheck, Users } from 'lucide-react';
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
    kind: 7,
    id: 'reactions',
    feedKey: 'feedIncludeReactions',
    label: 'Reactions',
    description: 'People reacting to posts (likes and emoji reactions). Disabled by default.',
    addressable: false,
    section: 'feed',
    feedOnly: true,
  },
  {
    kind: 9735,
    id: 'zaps',
    feedKey: 'feedIncludeZaps',
    // Combine Lightning (9735) and on-chain Bitcoin (8333) zaps into a single
    // toggle so users don't have to think about which rail was used.
    extraFeedKinds: [8333],
    label: 'Zaps',
    description: 'People zapping posts (Lightning and on-chain Bitcoin). Disabled by default.',
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
    blurb: 'Blog posts, essays, and guides. Write and publish long-form articles.',
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
    sites: [{ url: 'https://nodecast.xyz' }, { url: 'https://zaptrax.app', name: 'ZapTrax' }, { url: 'https://sunami.app', name: 'Sunami' }],
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
    showKey: 'showPeopleLists',
    feedKey: 'feedIncludePeopleLists',
    // Also include related people-list kinds under the same feed toggle:
    // kind 3 (NIP-02 follow list) and kind 30000 (NIP-51 follow set).
    extraFeedKinds: [3, 30000],
    label: 'People Lists',
    description: 'Follow packs, follow lists, and people sets',
    route: 'packs',
    addressable: true,
    section: 'social',
    blurb: 'Curated lists of people to follow — follow packs, follow lists, and people sets. Browse or create your own.',
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
  // Love Lists (feed-only — Ditto custom kind 15683, see NIP.md)
  {
    kind: 15683,
    id: 'love-lists',
    feedKey: 'feedIncludeLoveLists',
    label: 'Love Lists',
    description: 'Love List updates — the people someone truly loves (kind 15683)',
    addressable: false,
    section: 'social',
    feedOnly: true,
    blurb: 'A Love List names the people someone truly loves. The kind number spells "1·LOVE" on a phone keypad, and updates render as a paper love letter in the feed. Your own loved ones get a dedicated Loved tab at the front of your home feed.',
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
      {
        kind: 8,
        showKey: 'showBadgeAwards',
        feedKey: 'feedIncludeBadgeAwards',
        label: 'Badge Awards',
        description: 'Badge award events (kind 8)',
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
  // Blobbi (feed-only — dedicated page at /blobbi)
  {
    kind: 31124,
    id: 'blobbi',
    feedKey: 'feedIncludeBlobbi',
    label: 'Blobbi',
    description: 'Blobbi virtual pet updates',
    addressable: true,
    section: 'whimsy',
    feedOnly: true,
    blurb: 'Virtual pet companions living on Nostr. Care for them, watch them grow, and share their journey.',
  },
  // NIP-84 Highlights — kind 9802 (regular)
  {
    kind: 9802,
    id: 'highlights',
    showKey: 'showHighlights',
    feedKey: 'feedIncludeHighlights',
    label: 'Highlights',
    description: 'Noteworthy excerpts from articles, posts, and the web (NIP-84)',
    route: 'highlights',
    addressable: false,
    section: 'social',
    blurb: "Highlights are excerpts people find valuable — a paragraph from an article, a passage from a blog post, or a quote from anywhere on the web. Browse what people are reading and what's resonating.",
  },
  // Fundraisers — kind 33863 (addressable). Feed-only: opening a
  // campaign's naddr lands on PostDetailPage, which knows how to render
  // kind 33863 via CampaignContent. We don't host campaign creation or
  // donation flows in Ditto — those belong to Agora — but we surface
  // campaigns in feeds and threads.
  {
    kind: 33863,
    id: 'campaigns',
    feedKey: 'feedIncludeCampaigns',
    label: 'Fundraisers',
    description: 'Self-authored Bitcoin fundraising campaigns (Agora kind 33863)',
    addressable: true,
    section: 'social',
    feedOnly: true,
    blurb: 'Fundraisers from across Nostr. Authored on Agora; readable from anywhere. Each campaign is self-hosted by its creator, with a Bitcoin wallet endpoint for donations.',
    sites: [{ url: 'https://agora.spot', name: 'Agora' }],
  },
  // Birdstar (feed-only — external app, no Ditto page)
  {
    kind: 2473,
    id: 'bird-detections',
    feedKey: 'feedIncludeBirdDetections',
    label: 'Bird Detections',
    description: 'Species heard in the wild (Birdsong Spotter)',
    addressable: false,
    section: 'whimsy',
    feedOnly: true,
    blurb: 'Bird-by-ear detections — someone heard a species sing or call, and logged the sighting. Identified by Wikidata entity.',
    sites: [{ url: 'https://birdstar.app', name: 'Birdstar' }],
  },
  {
    kind: 12473,
    id: 'birdex',
    feedKey: 'feedIncludeBirdex',
    label: 'Birdex',
    description: 'Cumulative life list of every species a user has ever identified',
    addressable: false,
    section: 'whimsy',
    feedOnly: true,
    blurb: 'Birdex — an author\'s cumulative life list of every species they have ever identified, in chronological order of first detection.',
    sites: [{ url: 'https://birdstar.app', name: 'Birdstar' }],
  },
  {
    kind: 30621,
    id: 'constellations',
    feedKey: 'feedIncludeConstellations',
    label: 'Constellations',
    description: 'User-drawn custom star figures (Starpoint)',
    addressable: true,
    section: 'whimsy',
    feedOnly: true,
    blurb: 'Custom constellations drawn star-by-star on an interactive sky map. Trace your own figures and share them on Nostr.',
    sites: [{ url: 'https://birdstar.app', name: 'Birdstar' }],
  },
  // Development
  {
    kind: 30617,
    id: 'development',
    showKey: 'showDevelopment',
    label: 'Git',
    description: 'Nostr-native git collaboration (NIP-34)',
    route: 'development',
    addressable: true,
    section: 'development',
    blurb: 'Nostr-native git activity — repositories, pushes, patches, pull requests, issues, and status changes.',
    sites: [{ url: 'https://nostrhub.io', name: 'NostrHub' }, { url: 'https://gitworkshop.dev', name: 'Gitworkshop' }],
    subKinds: [
      {
        kind: 30617,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitRepos',
        label: 'Repositories',
        description: 'Repository announcements',
        addressable: true,
      },
      {
        kind: 30618,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitPushes',
        label: 'Pushes',
        description: 'Repository state updates — branches and tags after a push',
        addressable: true,
      },
      {
        kind: 1617,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitPatches',
        label: 'Patches',
        description: 'Code patches sent to a repository',
        addressable: false,
      },
      {
        kind: 1618,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitPullRequests',
        label: 'Pull Requests',
        description: 'Proposed branches to merge',
        addressable: false,
      },
      {
        kind: 1619,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitPrUpdates',
        label: 'Pull Request Updates',
        description: 'New commits pushed to an open pull request',
        addressable: false,
      },
      {
        kind: 1621,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitIssues',
        label: 'Issues',
        description: 'Bug reports, feature requests, and questions',
        addressable: false,
      },
      {
        kind: 1630,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitStatusReopened',
        label: 'Reopened Statuses',
        description: 'Issues and PRs marked open again',
        addressable: false,
      },
      {
        kind: 1631,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitStatusResolved',
        label: 'Resolved Statuses',
        description: 'Issues resolved, patches applied, PRs merged',
        addressable: false,
      },
      {
        kind: 1632,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitStatusClosed',
        label: 'Closed Statuses',
        description: 'Issues and PRs closed without merging',
        addressable: false,
      },
      {
        kind: 1633,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeGitStatusDraft',
        label: 'Draft Statuses',
        description: 'PRs marked as drafts',
        addressable: false,
      },
    ],
  },
  {
    kind: 30817,
    id: 'custom-nips',
    feedKey: 'feedIncludeCustomNips',
    label: 'Custom NIPs',
    description: 'Community protocol proposals',
    addressable: true,
    section: 'development',
    feedOnly: true,
    blurb: 'Community-drafted Nostr protocol proposals published on NostrHub.',
    sites: [{ url: 'https://nostrhub.io', name: 'NostrHub' }],
  },
  {
    kind: 15128,
    id: 'nsites',
    label: 'Nsites',
    description: 'Static websites hosted on Nostr',
    addressable: false,
    section: 'development',
    feedOnly: true,
    blurb: 'Static websites deployed to Blossom servers and announced on Nostr.',
    subKinds: [
      {
        kind: 15128,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeNsiteRoots',
        label: 'Root Sites',
        description: 'A user\'s main nsite deployment',
        addressable: false,
      },
      {
        kind: 35128,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeNsiteNamed',
        label: 'Named Sites',
        description: 'Additional named nsite deployments',
        addressable: true,
      },
    ],
  },
  {
    kind: 32267,
    id: 'zapstore',
    label: 'Zapstore',
    description: 'App store publishing on Nostr',
    addressable: true,
    section: 'development',
    feedOnly: true,
    blurb: 'Application listings and version releases published to the Zapstore app store.',
    sites: [{ url: 'https://zapstore.dev', name: 'Zapstore' }],
    subKinds: [
      {
        kind: 32267,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeZapstoreApps',
        label: 'Apps',
        description: 'App listings',
        addressable: true,
      },
      {
        kind: 30063,
        showKey: 'showDevelopment',
        feedKey: 'feedIncludeZapstoreReleases',
        label: 'Releases',
        description: 'New app version announcements',
        addressable: true,
      },
    ],
  },
  {
    kind: 31990,
    id: 'app-handlers',
    feedKey: 'feedIncludeAppHandlers',
    label: 'App Handlers',
    description: 'NIP-89 application handler announcements',
    addressable: true,
    section: 'development',
    feedOnly: true,
    blurb: 'Applications announcing which event kinds they can display or handle (NIP-89).',
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
 * Every kind number a def covers — parent kind, extraFeedKinds, and all
 * subKinds with their extraFeedKinds — regardless of user toggles. Used
 * for dedicated pages that always show the full category.
 */
export function getDefKinds(def: ExtraKindDef): number[] {
  const kinds = new Set<number>([def.kind, ...(def.extraFeedKinds ?? [])]);
  for (const sub of def.subKinds ?? []) {
    kinds.add(sub.kind);
    for (const k of sub.extraFeedKinds ?? []) kinds.add(k);
  }
  return [...kinds];
}

/**
 * Every kind number covered by all defs in a section, regardless of user
 * toggles. Used by section-wide pages (e.g. /development shows git
 * activity, custom NIPs, nsites, and apps together).
 */
export function getSectionKinds(section: ExtraKindSection): number[] {
  const kinds = new Set<number>();
  for (const def of EXTRA_KINDS) {
    if (def.section !== section) continue;
    for (const k of getDefKinds(def)) kinds.add(k);
  }
  return [...kinds];
}

/**
 * Specific labels for kinds that don't have their own top-level ExtraKindDef.
 * These are kinds buried in `extraFeedKinds` arrays or otherwise needing
 * a label more specific than their parent category.
 */
const KIND_SPECIFIC_LABELS: Record<number, string> = {
  3: 'follow list',
  6: 'repost',
  7: 'reaction',
  16: 'repost',
  30000: 'follow set',
  1617: 'patch',
  1618: 'pull request',
  1619: 'pull request update',
  1621: 'issue',
  1630: 'status update',
  1631: 'status update',
  1632: 'status update',
  1633: 'status update',
  30618: 'repository update',
  15128: 'nsite',
  35128: 'nsite',
  30008: 'badge set',
  30817: 'custom NIP',
  32267: 'Zapstore app',
  31990: 'app',
  30063: 'Zapstore release',
  3063: 'Zapstore asset',
};

/**
 * Specific icons for kinds that need a different icon than their parent category.
 */
const KIND_SPECIFIC_ICONS: Partial<Record<number, ComponentType<{ className?: string }>>> = {
  3: UserCheck,
  6: RepostIcon,
  16: RepostIcon,
  30000: Users,
  1617: GitPullRequestArrow,
  1618: GitPullRequest,
  1619: GitPullRequestArrow,
  1621: CircleDot,
  1630: CircleDot,
  1631: CircleCheck,
  1632: CircleX,
  1633: CircleDashed,
  30618: GitBranch,
  15128: Globe,
  15683: Heart,
  35128: Globe,
  30817: CircleAlert,
  2473: Bird,
  12473: Bird,
  30621: Stars,
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

/**
 * Extract the NIP-31 `alt` tag — the author's own human-readable fallback
 * text for clients that don't know how to render the event's kind.
 *
 * Only `alt` is consulted. Other tags (`title`, `name`, `summary`,
 * `description`, `d`) are intentionally excluded: they have kind-specific
 * semantics and are not guaranteed to be safe user-facing text. When `alt`
 * is missing, callers should render a neutral "unsupported kind" tombstone.
 *
 * Returns `undefined` if the event has no `alt` tag (or it's blank).
 */
export function getEventFallbackText(event: NostrEvent): string | undefined {
  const alt = event.tags.find(([n]) => n === 'alt')?.[1];
  return alt && alt.trim().length > 0 ? alt.trim() : undefined;
}
