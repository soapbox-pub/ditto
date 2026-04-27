import {
  Archive,
  Award,
  BarChart3,
  Bell,
  Blocks,
  BookMarked,
  Bookmark,
  BookOpen,
  Bot,
  CalendarDays,
  Camera,
  Clapperboard,
  Code,
  Earth,
  Film,
  HelpCircle,
  LayoutGrid,

  MessageSquare,
  MessageSquareMore,
  Mic,
  Music,
  Palette,
  PartyPopper,
  Podcast,
  Egg,
  Repeat2,
  Scroll,
  ScrollText,
  Search,
  Settings,
  Smile,
  SmilePlus,
  Sparkles,
  TrendingUp,
  User,
} from "lucide-react";
import { CardsIcon } from "@/components/icons/CardsIcon";
import { ChestIcon } from "@/components/icons/ChestIcon";
import { PlanetIcon } from "@/components/icons/PlanetIcon";
import { WikipediaIcon } from "@/components/icons/WikipediaIcon";
import { BlueskyIcon } from "@/components/icons/BlueskyIcon";
import { MailboxIcon } from "@/components/icons/MailboxIcon";

// ── Types ─────────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string }>;

/** Sentinel ID used to represent a visual divider in the sidebar order. */
export const SIDEBAR_DIVIDER_ID = "divider";

/** Returns true if the given sidebar order ID is a divider sentinel. */
export function isSidebarDivider(id: string): boolean {
  return id === SIDEBAR_DIVIDER_ID;
}

/** Returns true if the given sidebar order ID is a `nostr:` URI. */
export function isNostrUri(id: string): boolean {
  return id.startsWith("nostr:");
}

/** Extracts the NIP-19 bech32 identifier from a `nostr:` URI. Returns the raw string if not a nostr: URI. */
export function nostrUriToNip19(uri: string): string {
  return uri.startsWith("nostr:") ? uri.slice(6) : uri;
}

/**
 * Returns true if the given sidebar order ID is an external content identifier
 * (i-tag value): an https:// URL or a prefixed identifier like `iso3166:US`.
 */
export function isExternalUri(id: string): boolean {
  return (
    id.startsWith("https://") ||
    id.startsWith("http://") ||
    id.startsWith("iso3166:") ||
    id.startsWith("isbn:")
  );
}

/** Prefix used for synthetic sidebar ids backed by a tile nav-item. */
export const TILE_NAV_ITEM_PREFIX = "tile-nav:";

/** Returns true when the id is a tile nav-item synthetic id. */
export function isTileNavItemId(id: string): boolean {
  return id.startsWith(TILE_NAV_ITEM_PREFIX);
}

/** Build a synthetic sidebar id for a tile nav item. */
export function tileNavItemId(identifier: string): string {
  return `${TILE_NAV_ITEM_PREFIX}${identifier}`;
}

/** Extract the tile identifier from a synthetic tile-nav sidebar id. */
export function tileNavItemIdentifier(id: string): string {
  return id.startsWith(TILE_NAV_ITEM_PREFIX)
    ? id.slice(TILE_NAV_ITEM_PREFIX.length)
    : id;
}

/**
 * Module-level registry of live tile nav-items (keyed by tile identifier).
 *
 * The nostr-canvas runtime is loaded lazily, so the set of declared nav
 * items isn't known until a tile actually registers. `TileNavItemBinder`
 * (inside `NostrCanvasProvider`) pushes the runtime's list into this
 * registry; the sidebar lookup helpers below read from it synchronously.
 *
 * We keep this outside React state so `sidebarItems.tsx` can stay
 * context-free (every caller of `itemLabel`/`itemPath`/`sidebarItemIcon`
 * would otherwise need to thread a lookup fn through).
 */
interface TileNavRegistration {
  label: string;
  /** Optional raw image URL for the icon. Sanitised at read time. */
  iconUrl?: string;
}

const tileNavItemRegistry = new Map<string, TileNavRegistration>();
const tileNavItemListeners = new Set<() => void>();

/**
 * Snapshot reference published to `useSyncExternalStore` consumers.
 *
 * We can't return the live `tileNavItemRegistry` from `getSnapshot`
 * because `useSyncExternalStore` uses `Object.is` to detect changes —
 * mutating the same `Map` in place would never trigger a re-render. A
 * fresh `ReadonlyMap` is published on every write instead.
 */
let tileNavItemSnapshot: ReadonlyMap<string, TileNavRegistration> =
  new Map(tileNavItemRegistry);

/**
 * Replace the entire registry with the provided entries. Notifies
 * subscribers so `useSyncExternalStore` consumers re-render.
 */
export function setTileNavItemRegistry(
  entries: Array<{ identifier: string; label: string; iconUrl?: string }>,
): void {
  tileNavItemRegistry.clear();
  for (const entry of entries) {
    tileNavItemRegistry.set(entry.identifier, {
      label: entry.label,
      iconUrl: entry.iconUrl,
    });
  }
  // Publish a fresh snapshot so useSyncExternalStore's Object.is check
  // detects the change. If we returned the live Map, listeners would
  // fire but React would see no change and skip the re-render.
  tileNavItemSnapshot = new Map(tileNavItemRegistry);
  for (const listener of tileNavItemListeners) listener();
}

/** Subscribe to registry changes. Used by useSyncExternalStore. */
export function subscribeTileNavItemRegistry(listener: () => void): () => void {
  tileNavItemListeners.add(listener);
  return () => tileNavItemListeners.delete(listener);
}

/** Snapshot of currently-registered tile nav items. */
export function getTileNavItemRegistrySnapshot(): ReadonlyMap<
  string,
  TileNavRegistration
> {
  return tileNavItemSnapshot;
}

/** A sidebar-capable item with everything needed for display and navigation. */
export interface SidebarItemDef {
  /** Unique identifier stored in sidebarOrder. */
  id: string;
  /** Display label. */
  label: string;
  /** Navigation path (e.g. '/feed', '/notifications', '/vines'). */
  path: string;
  /** Icon component. */
  icon: IconComponent;
  /** If true, only shown when a user is logged in. */
  requiresAuth?: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Single source of truth for all sidebar items.
 *
 * Every item that can appear in the sidebar — whether it's a system page like
 * "Feed" or a Nostr content type like "Vines" — lives here with a consistent
 * shape. The order here is the default display order for fresh installs.
 */
export const SIDEBAR_ITEMS: SidebarItemDef[] = [
  // System pages
  { id: "feed", label: "Feed", path: "/feed", icon: PlanetIcon },
  {
    id: "notifications",
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    requiresAuth: true,
  },
  { id: "search", label: "Search", path: "/search", icon: Search },
  { id: "trends", label: "Trends", path: "/trends", icon: TrendingUp },
  {
    id: "bookmarks",
    label: "Bookmarks",
    path: "/bookmarks",
    icon: Bookmark,
    requiresAuth: true,
  },
  {
    id: "profile",
    label: "Profile",
    path: "/profile",
    icon: User,
    requiresAuth: true,
  },
  {
    id: "lists",
    label: "Lists",
    path: "/lists",
    icon: Scroll,
    requiresAuth: true,
  },
  { id: "settings", label: "Settings", path: "/settings", icon: Settings },
  { id: "changelog", label: "Changelog", path: "/changelog", icon: ScrollText },
  {
    id: "letters",
    label: "Letters",
    path: "/letters",
    icon: MailboxIcon,
    requiresAuth: true,
  },
  {
    id: "ai-chat",
    label: "AI Chat",
    path: "/ai-chat",
    icon: Bot,
    requiresAuth: true,
  },
  { id: 'blobbi', label: 'Blobbi', path: '/blobbi', icon: Egg, requiresAuth: true },
  { id: 'tiles', label: 'Tiles', path: '/tiles', icon: LayoutGrid },
  { id: "help", label: "Help", path: "/help", icon: HelpCircle },
  // Content types
  { id: "events", label: "Events", path: "/events", icon: CalendarDays },
  { id: "photos", label: "Photos", path: "/photos", icon: Camera },
  { id: "videos", label: "Videos", path: "/videos", icon: Film },
  { id: "articles", label: "Articles", path: "/articles", icon: BookOpen },
  { id: "books", label: "Books", path: "/books", icon: BookMarked },
  { id: "vines", label: "Divines", path: "/vines", icon: Clapperboard },
  { id: "music", label: "Music", path: "/music", icon: Music },
  { id: "podcasts", label: "Podcasts", path: "/podcasts", icon: Podcast },

  { id: "webxdc", label: "Webxdc", path: "/webxdc", icon: Blocks },
  { id: "themes", label: "Themes", path: "/themes", icon: Sparkles },
  { id: "polls", label: "Polls", path: "/polls", icon: BarChart3 },
  { id: "packs", label: "Follow Packs", path: "/packs", icon: PartyPopper },
  { id: "colors", label: "Color Moments", path: "/colors", icon: Palette },
  { id: "decks", label: "Magic Decks", path: "/decks", icon: CardsIcon },
  { id: "treasures", label: "Treasures", path: "/treasures", icon: ChestIcon },
  { id: "emojis", label: "Emojis", path: "/emojis", icon: SmilePlus },
  { id: "development", label: "Development", path: "/development", icon: Code },
  { id: "badges", label: "Badges", path: "/badges", icon: Award },
  { id: "world", label: "World", path: "/world", icon: Earth },
  { id: "archive", label: "Archive", path: "/archive", icon: Archive },
  { id: "wikipedia", label: "Wikipedia", path: "/wikipedia", icon: WikipediaIcon },
  { id: "bluesky", label: "Bluesky", path: "/bluesky", icon: BlueskyIcon },
];

/** Set of all known sidebar item IDs for quick lookup. */
export const SIDEBAR_ITEM_IDS = new Set(SIDEBAR_ITEMS.map((s) => s.id));

/** Map from ID to definition for O(1) lookup. */
const SIDEBAR_ITEM_MAP = new Map(SIDEBAR_ITEMS.map((s) => [s.id, s]));

/**
 * Icons for content types used outside the sidebar (e.g. ContentSettings).
 * Feed-only kinds that don't have sidebar pages are included here too.
 */
export const CONTENT_KIND_ICONS: Record<string, IconComponent> = {
  posts: MessageSquare,
  comments: MessageSquareMore,
  reposts: Repeat2,
  "generic-reposts": Repeat2,
  voice: Mic,
  "custom-emojis": Smile,
  statuses: SmilePlus,
  ...Object.fromEntries(
    SIDEBAR_ITEMS.filter((s) => s.icon).map((s) => [s.id, s.icon]),
  ),
};

// ── Lookups ───────────────────────────────────────────────────────────────────

/** Get the sidebar item definition by ID, or undefined if unknown. */
export function getSidebarItem(id: string): SidebarItemDef | undefined {
  return SIDEBAR_ITEM_MAP.get(id);
}

/** Returns the icon element for a sidebar item ID at the given size. */
export function sidebarItemIcon(
  id: string,
  size = "size-6",
): React.ReactElement {
  if (isTileNavItemId(id)) {
    return <LayoutGrid className={size} />;
  }
  const Icon = SIDEBAR_ITEM_MAP.get(id)?.icon ?? Palette;
  return <Icon className={size} />;
}

/** Lookup display label for a sidebar item ID. */
export function itemLabel(id: string): string {
  if (isTileNavItemId(id)) {
    const identifier = tileNavItemIdentifier(id);
    return tileNavItemRegistry.get(identifier)?.label ?? identifier;
  }
  return SIDEBAR_ITEM_MAP.get(id)?.label ?? id;
}

/** Lookup navigation path for a sidebar item ID. */
export function itemPath(
  id: string,
  profilePath?: string,
  homePage?: string,
): string {
  if (isTileNavItemId(id)) {
    return `/tiles/run/${encodeURIComponent(tileNavItemIdentifier(id))}`;
  }
  if (id === "profile" && profilePath) return profilePath;
  if (homePage && id === homePage) return "/";
  return SIDEBAR_ITEM_MAP.get(id)?.path ?? `/${id}`;
}

/**
 * Search sidebar items by label. Matches when the query is a prefix of the
 * full label or of any word within the label (e.g. "arch" matches "Archive"
 * and "Internet Archive" but not "Search"). Whole-label prefix matches are
 * sorted before word-boundary matches. Auth-requiring items are excluded
 * when the user is not logged in.
 */
export function searchSidebarItems(
  query: string,
): SidebarItemDef[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const prefixMatches: SidebarItemDef[] = [];
  const wordMatches: SidebarItemDef[] = [];

  for (const item of SIDEBAR_ITEMS) {
    const label = item.label.toLowerCase();
    if (label.startsWith(q)) {
      prefixMatches.push(item);
    } else {
      // Check if query matches the start of any word in the label
      const words = label.split(/\s+/);
      if (words.some((word) => word.startsWith(q))) {
        wordMatches.push(item);
      }
    }
  }

  return [...prefixMatches, ...wordMatches];
}

/** Check if a sidebar item is active given the current location. */
export function isItemActive(
  id: string,
  pathname: string,
  _search: string,
  profilePath?: string,
  homePage?: string,
): boolean {
  // Tile nav items: active when the /tiles/run/... path matches.
  if (isTileNavItemId(id)) {
    const identifier = tileNavItemIdentifier(id);
    return (
      pathname === `/tiles/run/${encodeURIComponent(identifier)}` ||
      pathname === `/tiles/run/${identifier}`
    );
  }

  // Nostr URI items: active when pathname matches /<nip19>
  if (isNostrUri(id)) {
    const nip19Id = nostrUriToNip19(id);
    return pathname === `/${nip19Id}`;
  }

  // External content items: active when pathname matches /i/<encoded-value>
  if (isExternalUri(id)) {
    return pathname === `/i/${encodeURIComponent(id)}` || pathname === `/i/${id}`;
  }

  if (id === "profile") return !!profilePath && pathname === profilePath;
  if (id === "settings") return pathname.startsWith("/settings");

  const itemDef = SIDEBAR_ITEM_MAP.get(id);
  const itemPathname = itemDef?.path ?? `/${id}`;

  // Homepage item is active at both "/" and its own path
  if (homePage && id === homePage)
    return pathname === "/" || pathname === itemPathname;

  return pathname === itemPathname;
}
