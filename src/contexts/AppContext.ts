import { createContext } from "react";

export type Theme = "dark" | "light" | "black" | "pink";

export interface RelayMetadata {
  /** List of relays with read/write permissions */
  relays: { url: string; read: boolean; write: boolean }[];
  /** Unix timestamp of when the relay list was last updated */
  updatedAt: number;
}

/** Which "Other Stuff" content types to show in the sidebar nav and include in feeds. */
export interface FeedSettings {
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
}

export interface AppConfig {
  /** Current theme */
  theme: Theme;
  /** NIP-65 relay list metadata */
  relayMetadata: RelayMetadata;
  /** Whether to use app default relays in addition to user relays */
  useAppRelays: boolean;
  /** Feed and sidebar content settings */
  feedSettings: FeedSettings;
  /** NIP-85 stats pubkey source (hex format) */
  nip85StatsPubkey: string;
  /** Whether to disable manual stat calculation fallback (NIP-85 only mode) */
  nip85OnlyMode: boolean;
  /** Blossom file upload server URLs */
  blossomServers: string[];
  /** Default comment attached to zaps */
  defaultZapComment: string;
  /** Favicon provider URI template. Use {href} as placeholder for the page URL. */
  faviconProvider: string;
  /** CORS proxy URI template. Use {href} as placeholder for the target URL (URL-encoded). */
  corsProxy: string;
}

export interface AppContextType {
  /** Current application configuration */
  config: AppConfig;
  /** Update configuration using a callback that receives current config and returns new config */
  updateConfig: (updater: (currentConfig: Partial<AppConfig>) => Partial<AppConfig>) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
