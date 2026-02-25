import { createContext } from "react";
import type { ThemeTokens } from "@/themes";

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

/** Which "Other Stuff" content types to show in the sidebar nav and include in feeds. */
export interface FeedSettings {
  /** Include text posts (kind 1) in the feed */
  feedIncludePosts: boolean;
  /** Include reposts (kind 6) in the feed */
  feedIncludeReposts: boolean;
  /** Include long-form articles (kind 30023) in the feed */
  feedIncludeArticles: boolean;
  /** Show Articles (kind 30023) link in sidebar */
  showArticles: boolean;
  /** Show Vines (kind 34236) link in sidebar */
  showVines: boolean;
  /** Show Polls (kind 1068) link in sidebar */
  showPolls: boolean;
  /** Show Treasures link in sidebar */
  showTreasures: boolean;
  /** Show Geocache listings (kind 37516) in Treasures */
  showTreasureGeocaches: boolean;
  /** Show Found logs (kind 7516) in Treasures */
  showTreasureFoundLogs: boolean;
  /** Show Colors (kind 3367) link in sidebar */
  showColors: boolean;
  /** Show Follow Packs (kind 39089) link in sidebar */
  showPacks: boolean;
  /** Show Streams (kind 30311) link in sidebar */
  showStreams: boolean;
  /** Include Vines in the follows/global feed */
  feedIncludeVines: boolean;
  /** Include Polls in the follows/global feed */
  feedIncludePolls: boolean;
  /** Include Treasure geocaches in the follows/global feed */
  feedIncludeTreasureGeocaches: boolean;
  /** Include Treasure found logs in the follows/global feed */
  feedIncludeTreasureFoundLogs: boolean;
  /** Include Colors in the follows/global feed */
  feedIncludeColors: boolean;
  /** Include Follow Packs in the follows/global feed */
  feedIncludePacks: boolean;
  /** Include Streams in the follows/global feed */
  feedIncludeStreams: boolean;
  /** Show Magic Decks (kind 37381) link in sidebar */
  showDecks: boolean;
  /** Include Magic Decks in the follows/global feed */
  feedIncludeDecks: boolean;
}

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** Token values for the custom theme slot. Only used when theme === "custom". */
  customTheme?: ThemeTokens;
  /** NIP-65 relay list metadata */
  relayMetadata: RelayMetadata;
  /** Whether to use app default relays in addition to user relays */
  useAppRelays: boolean;
  /** Feed and sidebar content settings */
  feedSettings: FeedSettings;
  /** Ordered list of content-type route names for the sidebar Explore section. */
  sidebarOrder: string[];
  /** NIP-85 stats pubkey source (hex format) */
  nip85StatsPubkey: string;
  /** Blossom file upload server URLs */
  blossomServers: string[];
  /** Default comment attached to zaps */
  defaultZapComment: string;
  /** Favicon URI template. Supports RFC 6570 variables: {href}, {origin}, {hostname}, etc. */
  faviconUrl: string;
  /** Link preview URI template. Supports RFC 6570 variables: {url}, {href}, {origin}, {hostname}, etc. Returns OEmbed JSON. */
  linkPreviewUrl: string;
  /** CORS proxy URI template. Use {href} as placeholder for the target URL (URL-encoded). */
  corsProxy: string;
  /** How to handle NIP-36 content-warning events (blur, hide, or show). Default: "blur". */
  contentWarningPolicy: ContentWarningPolicy;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
