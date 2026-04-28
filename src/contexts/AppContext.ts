import { createContext } from "react";
import type { ThemeConfig, ThemesConfig } from "@/themes";

/**
 * A builtin theme whose colors are defined at build time.
 * "system" resolves to "light" or "dark" based on OS preference.
 * "custom" uses user-defined token values stored in `customTheme`.
 */
export type Theme = "light" | "dark" | "system" | "custom";

/**
 * How to handle events with a NIP-36 content-warning tag.
 * - "blur": Show a warning overlay; media is not loaded until the user reveals.
 * - "hide": Remove the event from view entirely.
 * - "show": Ignore the content-warning tag and display normally.
 */
export type ContentWarningPolicy = "blur" | "hide" | "show";

/** How to handle events with a NIP-36 content-warning tag. */
export type NsfwPolicy = "blur" | "hide" | "show";

export interface RelayMetadata {
  /** List of relays with read/write permissions */
  relays: { url: string; read: boolean; write: boolean }[];
  /** Unix timestamp of when the relay list was last updated */
  updatedAt: number;
}

/** Blossom server list metadata, mirroring RelayMetadata for parity with relay management. */
export interface BlossomServerMetadata {
  /** Ordered list of Blossom server URLs (most trusted/reliable first per BUD-03). */
  servers: string[];
  /** Unix timestamp of when the server list was last updated (from kind 10063 created_at). */
  updatedAt: number;
}

/** Which "Other Stuff" content types to show in the sidebar nav and include in feeds. */
export interface FeedSettings {
  /** Include text posts (kind 1) in the feed */
  feedIncludePosts: boolean;
  /** Include NIP-22 comments (kind 1111) in the feed */
  feedIncludeComments: boolean;
  /** Include reposts (kind 6) in the feed */
  feedIncludeReposts: boolean;
  /** Include generic reposts (kind 16) in the feed */
  feedIncludeGenericReposts: boolean;
  /** Include long-form articles (kind 30023) in the feed */
  feedIncludeArticles: boolean;
  /** Show Articles (kind 30023) link in sidebar */
  showArticles: boolean;
  /** Show Events (kind 31922/31923) link in sidebar */
  showEvents: boolean;
  /** Include calendar events in the follows/global feed */
  feedIncludeEvents: boolean;
  /** Show Vines (kind 34236) link in sidebar */
  showVines: boolean;
  /** Show Polls (kind 1068) link in sidebar */
  showPolls: boolean;
  /** Show Treasures link in sidebar */
  showTreasures: boolean;
  /** Show Treasure listings (kind 37516) in Treasures */
  showTreasureGeocaches: boolean;
  /** Show Found logs (kind 7516) in Treasures */
  showTreasureFoundLogs: boolean;
  /** Show Colors (kind 3367) link in sidebar */
  showColors: boolean;
  /** Show People Lists (kind 39089 follow packs, kind 30000 people sets) link in sidebar */
  showPeopleLists: boolean;
  /** Include Vines in the follows/global feed */
  feedIncludeVines: boolean;
  /** Include Polls in the follows/global feed */
  feedIncludePolls: boolean;
  /** Include Treasure listings in the follows/global feed */
  feedIncludeTreasureGeocaches: boolean;
  /** Include Treasure found logs in the follows/global feed */
  feedIncludeTreasureFoundLogs: boolean;
  /** Include Colors in the follows/global feed */
  feedIncludeColors: boolean;
  /** Include People Lists (kind 3 follow lists, kind 30000 people sets, kind 39089 follow packs) in the follows/global feed */
  feedIncludePeopleLists: boolean;
  /** Show Magic Decks (kind 37381) link in sidebar */
  showDecks: boolean;
  /** Include Magic Decks in the follows/global feed */
  feedIncludeDecks: boolean;
  /** Show Webxdc apps (NIP-94 kind 1063 with m=application/x-webxdc) link in sidebar */
  showWebxdc: boolean;
  /** Include Webxdc apps in the follows/global feed */
  feedIncludeWebxdc: boolean;
  /** Show Themes link in sidebar */
  showProfileThemes: boolean;
  /** Include Profile Theme updates in the follows/global feed (legacy key, maps to feedIncludeThemeDefinitions + feedIncludeProfileThemeUpdates) */
  feedIncludeProfileThemes: boolean;
  /** Show theme definitions (kind 36767) on Themes page */
  showThemeDefinitions: boolean;
  /** Include theme definitions in the follows/global feed */
  feedIncludeThemeDefinitions: boolean;
  /** Show profile theme updates (kind 16767) on Themes page */
  showProfileThemeUpdates: boolean;
  /** Include profile theme updates in the follows/global feed */
  feedIncludeProfileThemeUpdates: boolean;
  /** Show custom profile themes when visiting other users' profiles */
  showCustomProfileThemes: boolean;
  /** Include voice messages (kind 1222 + 1244) in the follows/global feed */
  feedIncludeVoiceMessages: boolean;
  /** Show NIP-30 custom emojis in the emoji picker */
  showCustomEmojis: boolean;
  /** Show Emoji Packs (kind 30030) link in sidebar */
  showEmojiPacks: boolean;
  /** Include Emoji Packs in the follows/global feed */
  feedIncludeEmojiPacks: boolean;
  /** Show Photos (NIP-68, kind 20) link in sidebar */
  showPhotos: boolean;
  /** Include Photos in the follows/global feed */
  feedIncludePhotos: boolean;
  /** Show Videos page (NIP-71 kinds 21/22) link in sidebar */
  showVideos: boolean;
  /** Include normal videos (kind 21) in the follows/global feed */
  feedIncludeNormalVideos: boolean;
  /** Include short videos (kind 22) in the follows/global feed */
  feedIncludeShortVideos: boolean;
  /** Show NIP-38 user statuses on profiles and note cards */
  showUserStatuses: boolean;
  /** Show Music (kind 36787 tracks + kind 34139 playlists) link in sidebar */
  showMusic: boolean;
  /** Include music tracks (kind 36787) in the follows/global feed */
  feedIncludeMusicTracks: boolean;
  /** Include music playlists (kind 34139) in the follows/global feed */
  feedIncludeMusicPlaylists: boolean;
  /** Show Podcasts (kind 30054 episodes + kind 30055 trailers) link in sidebar */
  showPodcasts: boolean;
  /** Include podcast episodes (kind 30054) in the follows/global feed */
  feedIncludePodcastEpisodes: boolean;
  /** Include podcast trailers (kind 30055) in the follows/global feed */
  feedIncludePodcastTrailers: boolean;
  /** Show Development (NIP-34 repos, patches, PRs, custom NIPs, app submissions) link in sidebar */
  showDevelopment: boolean;
  /** Include Development content in the follows/global feed */
  feedIncludeDevelopment: boolean;
  /** Show Badges (NIP-58 kind 30009) link in sidebar */
  showBadges: boolean;
  /** Show badge definitions (kind 30009) on the Badges page */
  showBadgeDefinitions: boolean;
  /** Show profile badges (kind 10008/30008) on the Badges page */
  showProfileBadges: boolean;
  /** Show badge awards (kind 8) on the Badges page */
  showBadgeAwards: boolean;
  /** Include badge definitions (kind 30009) in the follows/global feed */
  feedIncludeBadgeDefinitions: boolean;
  /** Include profile badges (kind 10008/30008) in the follows/global feed */
  feedIncludeProfileBadges: boolean;
  /** Include badge awards (kind 8) in the follows/global feed */
  feedIncludeBadgeAwards: boolean;
  /** Include Request to Vanish events (kind 62) in the follows/global feed */
  feedIncludeVanish: boolean;
  /** Include Blobbi pet updates (kind 31124) in the follows/global feed */
  feedIncludeBlobbi: boolean;
  /** Show Birdstar (kind 2473 bird detections + kind 30621 custom constellations) link in sidebar */
  showBirdstar: boolean;
  /** Include bird detections (kind 2473) in the follows/global feed */
  feedIncludeBirdDetections: boolean;
  /** Include custom constellations (kind 30621) in the follows/global feed */
  feedIncludeConstellations: boolean;
  /** Include replies in the follows feed (default: true) */
  followsFeedShowReplies: boolean;
}

/**
 * A standard NIP-01 filter object that may contain variable placeholders
 * (`$name`) in string positions. After resolution, becomes a `NostrFilter`.
 */
export type TabFilter = Record<string, unknown>;

/** A variable definition for tab filters (extracted from `var` tags). */
export interface TabVarDef {
  /** Variable name including the `$` prefix, e.g. `"$follows"`. */
  name: string;
  /** Tag name to extract from the referenced event, e.g. `"p"`. */
  tagName: string;
  /** Event pointer: `e:<id>` or `a:<kind>:<pubkey>:<d-tag>`. May contain variables. */
  pointer: string;
}

/** A named feed tab saved from the search page. */
export interface SavedFeed {
  id: string;
  label: string;
  filter: TabFilter;
  vars: TabVarDef[];
  createdAt: number;
}

export interface AppConfig {
  /** Application display name used in page titles, UI text, and branding. Default: "Ditto". */
  appName: string;
  /** Application identifier used as a prefix for application-specific metadata (NIP-78 d-tags, etc). Default: "ditto". */
  appId: string;
  /**
   * Canonical origin used when generating shareable URLs (QR codes, copy-link,
   * remote-login callbacks, etc). Falls back to `window.location.origin` when
   * unset. Configure this in `ditto.json` for native builds, where
   * `window.location.origin` is `capacitor://localhost` or `https://localhost`.
   * Must NOT include a trailing slash.
   */
  shareOrigin?: string;
  /** Sidebar item ID to display on the homepage ("/"). Default: "feed". */
  homePage: string;
  /** Display name used in the NIP-89 "client" tag. Falls back to `appName` when not set. */
  clientName?: string;
  /** NIP-19 `naddr1…` identifying this client's kind 31990 handler event. Decoded at publish time to produce the `31990:<pubkey>:<d-tag>` addr and relay hint for the "client" tag per NIP-89. */
  client?: string;
  /** Enable Magic Mouse mode: cursor/finger emanates magical fire in the primary color */
  magicMouse: boolean;
  /** Current theme */
  theme: Theme;
  /** Custom theme config (colors, fonts, background). Only used when theme === "custom". */
  customTheme?: ThemeConfig;
  /** Automatically publish custom theme changes to profile (kind 16767). Default: true. */
  autoShareTheme: boolean;
  /** Configured light and dark themes. Overrides the builtin themes when set. */
  themes?: ThemesConfig;
  /** NIP-65 relay list metadata */
  relayMetadata: RelayMetadata;
  /** Whether to use app default relays in addition to user relays */
  useAppRelays: boolean;
  /** Feed and sidebar content settings */
  feedSettings: FeedSettings;
  /** Ordered list of sidebar item IDs (built-in + extra-kind). */
  sidebarOrder: string[];
  /** NIP-85 stats pubkey source (hex format) */
  nip85StatsPubkey: string;
  /**
   * Blossom file upload server metadata (BUD-03).
   * `servers` is the user's personal list, synced from/to kind 10063.
   * App default servers are managed separately via APP_BLOSSOM_SERVERS.
   */
  blossomServerMetadata: BlossomServerMetadata;
  /**
   * Whether to use app default Blossom servers in addition to the user's kind 10063 servers.
   * Mirrors `useAppRelays` semantics for Blossom.
   */
  useAppBlossomServers: boolean;
  /** Favicon URI template. Supports RFC 6570 variables: {href}, {origin}, {hostname}, etc. */
  faviconUrl: string;
  /** Link preview URI template. Supports RFC 6570 variables: {url}, {href}, {origin}, {hostname}, etc. Returns OEmbed JSON. */
  linkPreviewUrl: string;
  /** CORS proxy URI template. Use {href} as placeholder for the target URL (URL-encoded). */
  corsProxy: string;
  /** How to handle NIP-36 content-warning events (blur, hide, or show). Default: "blur". */
  contentWarningPolicy: ContentWarningPolicy;
  /** Sentry DSN for error reporting (empty string = disabled). */
  sentryDsn: string;
  /** Whether the user has enabled Sentry error reporting. */
  sentryEnabled: boolean;
  /** Plausible Analytics domain (empty string = disabled). */
  plausibleDomain: string;
  /** Plausible Analytics API endpoint (empty string = use default). */
  plausibleEndpoint: string;
  /** Saved home feed tabs. Cached locally so they appear instantly on load. */
  savedFeeds: SavedFeed[];
  /** Autoplay videos in feeds and previews (muted). Default: false. */
  autoplayVideos: boolean;
  /** Image upload quality: "compressed" resizes/optimizes, "original" uploads as-is. Default: "compressed". */
  imageQuality: 'compressed' | 'original';
  /** Hex pubkey of the curator whose follow list defines the Ditto feed. */
  curatorPubkey?: string;
  /** Wildcard domain used for iframe sandboxing (e.g. "iframe.diy"). Default: "iframe.diy". */
  sandboxDomain: string;
  /** Ordered list of right sidebar widget configs. Each entry is a widget type ID with optional display settings. */
  sidebarWidgets: WidgetConfig[];
  /** Base URL for the AI chat-completions provider (OpenAI-compatible /v1 endpoint). */
  aiBaseURL: string;
  /** API key for the AI provider. Empty string = use NIP-98 auth (only valid for Shakespeare). */
  aiApiKey: string;
  /** AI model identifier sent to the provider (e.g. "grok-4.1-fast", "claude-opus-4.6"). */
  aiModel: string;
  /** Custom system prompt for the AI buddy. Empty string = use default template. */
  aiSystemPrompt: string;
}

/** Configuration for a single widget in the right sidebar. */
export interface WidgetConfig {
  /** Widget type identifier (e.g. "trends", "blobbi", "wikipedia", "bluesky"). */
  id: string;
  /** User-configured height in pixels. Overrides the widget's default height. */
  height?: number;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (
    updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>,
  ) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
