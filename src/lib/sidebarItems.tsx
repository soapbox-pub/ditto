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
  Mail,
  MessageSquare,
  MessageSquareMore,
  Mic,
  Music,
  Palette,
  PartyPopper,
  Podcast,
  Repeat2,
  Scroll,
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
  {
    id: "messages",
    label: "Messages",
    path: "/messages",
    icon: Mail,
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
  {
    id: "ai-chat",
    label: "AI Chat",
    path: "/ai-chat",
    icon: Bot,
    requiresAuth: true,
  },
  { id: "help", label: "Help", path: "/help", icon: HelpCircle },
  // Content types
  { id: "events", label: "Events", path: "/events", icon: CalendarDays },
  { id: "photos", label: "Photos", path: "/photos", icon: Camera },
  { id: "videos", label: "Videos", path: "/videos", icon: Film },
  { id: "articles", label: "Articles", path: "/articles", icon: BookOpen },
  { id: "books", label: "Books", path: "/books", icon: BookMarked },
  { id: "vines", label: "Vines", path: "/vines", icon: Clapperboard },
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
  const Icon = SIDEBAR_ITEM_MAP.get(id)?.icon ?? Palette;
  return <Icon className={size} />;
}

/** Lookup display label for a sidebar item ID. */
export function itemLabel(id: string): string {
  return SIDEBAR_ITEM_MAP.get(id)?.label ?? id;
}

/** Lookup navigation path for a sidebar item ID. */
export function itemPath(
  id: string,
  profilePath?: string,
  homePage?: string,
): string {
  if (id === "profile" && profilePath) return profilePath;
  if (homePage && id === homePage) return "/";
  return SIDEBAR_ITEM_MAP.get(id)?.path ?? `/${id}`;
}

/** Check if a sidebar item is active given the current location. */
export function isItemActive(
  id: string,
  pathname: string,
  _search: string,
  profilePath?: string,
  homePage?: string,
): boolean {
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
