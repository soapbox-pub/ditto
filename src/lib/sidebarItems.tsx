import {
  Archive,
  Award,
  BarChart3,
  Bell,
  Bird,
  Blocks,
  BookMarked,
  Bookmark,
  BookOpen,
  Bot,
  CalendarDays,
  Camera,
  Clapperboard,
  ClipboardList,
  Code,
  Crown,
  Earth,
  FileCode,
  Film,
  Gamepad2,
  Ghost,
  HandHeart,
  Heart,
  Magnet,
  HelpCircle,

  MessageSquare,
  MessageSquareMore,
  Mic,
  MoonStar,
  Music,
  Package,
  Palette,
  PartyPopper,
  Podcast,
  Egg,
  Quote,
  Repeat2,
  Rocket,
  Scroll,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Smile,
  SmilePlus,
  Wallet,
  Sparkles,
  Stars,
  Tag,
  TrendingUp,
  User,
  Zap,
} from "lucide-react";
import { defineMessages, useIntl, type IntlShape, type MessageDescriptor } from "react-intl";
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

/** Returns true if the given sidebar order ID is an `nsite://` URI. */
export function isNsiteUri(id: string): boolean {
  return id.startsWith("nsite://");
}

/** Extracts the nsite subdomain from an `nsite://` URI. */
export function nsiteUriToSubdomain(uri: string): string {
  return uri.slice("nsite://".length);
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

/**
 * Grouping used to organize items in the "More..." menu.
 *
 * Most items are hidden by default, so this menu is where users discover what
 * Ditto can show. A flat list of 30+ entries is unscannable; these groups turn
 * it into a handful of clusters.
 */
export type SidebarSection =
  | "yours"
  | "app"
  | "social"
  | "media"
  | "reading"
  | "fun"
  | "personalize"
  | "tools";

/** Display order of sections in the "More..." menu. */
export const SIDEBAR_SECTION_ORDER: SidebarSection[] = [
  "yours",
  "app",
  "social",
  "media",
  "reading",
  "fun",
  "personalize",
  "tools",
];

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
  /** Grouping used to organize the "More..." menu. */
  section: SidebarSection;
}

/**
 * Translatable labels for every sidebar item, keyed by item ID. Kept as static
 * descriptors so `npm run i18n:extract` can see them.
 */
const SIDEBAR_ITEM_LABELS: Record<string, MessageDescriptor> = defineMessages({
  feed: { id: "nav.feed", defaultMessage: "Feed" },
  notifications: { id: "nav.notifications", defaultMessage: "Notifications" },
  search: { id: "nav.search", defaultMessage: "Search" },
  trends: { id: "nav.trends", defaultMessage: "Trends" },
  bookmarks: { id: "nav.bookmarks", defaultMessage: "Bookmarks" },
  "top-8": { id: "nav.top-8", defaultMessage: "Top 8" },
  profile: { id: "nav.profile", defaultMessage: "Profile" },
  lists: { id: "nav.lists", defaultMessage: "Lists" },
  settings: { id: "nav.settings", defaultMessage: "Settings" },
  wallet: { id: "nav.wallet", defaultMessage: "Wallet" },
  changelog: { id: "nav.changelog", defaultMessage: "Changelog" },
  letters: { id: "nav.letters", defaultMessage: "Letters" },
  "ai-chat": { id: "nav.ai-chat", defaultMessage: "AI Chat" },
  blobbi: { id: "nav.blobbi", defaultMessage: "Blobbi" },
  help: { id: "nav.help", defaultMessage: "Help" },
  events: { id: "nav.events", defaultMessage: "Events" },
  photos: { id: "nav.photos", defaultMessage: "Photos" },
  videos: { id: "nav.videos", defaultMessage: "Videos" },
  articles: { id: "nav.articles", defaultMessage: "Articles" },
  highlights: { id: "nav.highlights", defaultMessage: "Highlights" },
  books: { id: "nav.books", defaultMessage: "Books" },
  vines: { id: "nav.vines", defaultMessage: "Shorts" },
  music: { id: "nav.music", defaultMessage: "Music" },
  podcasts: { id: "nav.podcasts", defaultMessage: "Podcasts" },
  torrents: { id: "nav.torrents", defaultMessage: "Torrents" },
  webxdc: { id: "nav.webxdc", defaultMessage: "Webxdc" },
  themes: { id: "nav.themes", defaultMessage: "Themes" },
  polls: { id: "nav.polls", defaultMessage: "Polls" },
  packs: { id: "nav.packs", defaultMessage: "Follow Packs" },
  colors: { id: "nav.colors", defaultMessage: "Color Moments" },
  decks: { id: "nav.decks", defaultMessage: "Magic Decks" },
  tarot: { id: "nav.tarot", defaultMessage: "Tarot" },
  treasures: { id: "nav.treasures", defaultMessage: "Treasures" },
  quizzes: { id: "nav.quizzes", defaultMessage: "Quizzes" },
  cards: { id: "nav.cards", defaultMessage: "Memory Cards" },
  emojis: { id: "nav.emojis", defaultMessage: "Emojis" },
  development: { id: "nav.development", defaultMessage: "Development" },
  badges: { id: "nav.badges", defaultMessage: "Badges" },
  world: { id: "nav.world", defaultMessage: "World" },
  archive: { id: "nav.archive", defaultMessage: "Archive" },
  wikipedia: { id: "nav.wikipedia", defaultMessage: "Wikipedia" },
  bluesky: { id: "nav.bluesky", defaultMessage: "Bluesky" },
});

// ── Registry ──────────────────────────────────────────────────────────────────

/**
 * Single source of truth for all sidebar items.
 *
 * Every item that can appear in the sidebar — whether it's a system page like
 * "Feed" or a Nostr content type like "Shorts" — lives here with a consistent
 * shape. The order here is the default display order for fresh installs.
 */
export const SIDEBAR_ITEMS: SidebarItemDef[] = [
  // System pages
  { id: "feed", label: "Feed", path: "/feed", icon: PlanetIcon, section: "app" },
  {
    id: "notifications",
    label: "Notifications",
    path: "/notifications",
    icon: Bell,
    requiresAuth: true,
    section: "yours",
  },
  { id: "search", label: "Search", path: "/search", icon: Search, section: "app" },
  { id: "trends", label: "Trends", path: "/trends", icon: TrendingUp, section: "app" },
  {
    id: "bookmarks",
    label: "Bookmarks",
    path: "/bookmarks",
    icon: Bookmark,
    requiresAuth: true,
    section: "yours",
  },
  {
    id: "top-8",
    label: "Top 8",
    path: "/top-8",
    icon: Crown,
    requiresAuth: true,
    section: "yours",
  },
  {
    id: "profile",
    label: "Profile",
    path: "/profile",
    icon: User,
    requiresAuth: true,
    section: "yours",
  },
  {
    id: "lists",
    label: "Lists",
    path: "/lists",
    icon: Scroll,
    requiresAuth: true,
    section: "yours",
  },
  { id: "settings", label: "Settings", path: "/settings", icon: Settings, section: "app" },
  {
    id: "wallet",
    label: "Wallet",
    path: "/wallet",
    icon: Wallet,
    requiresAuth: true,
    section: "yours",
  },
  { id: "changelog", label: "Changelog", path: "/changelog", icon: ScrollText, section: "app" },
  {
    id: "letters",
    label: "Letters",
    path: "/letters",
    icon: MailboxIcon,
    requiresAuth: true,
    section: "social",
  },
  {
    id: "ai-chat",
    label: "AI Chat",
    path: "/ai-chat",
    icon: Bot,
    requiresAuth: true,
    section: "tools",
  },
  { id: 'blobbi', label: 'Blobbi', path: '/blobbi', icon: Egg, requiresAuth: true, section: "fun" },
  { id: "help", label: "Help", path: "/help", icon: HelpCircle, section: "app" },
  // Content types
  { id: "events", label: "Events", path: "/events", icon: CalendarDays, section: "social" },
  { id: "photos", label: "Photos", path: "/photos", icon: Camera, section: "media" },
  { id: "videos", label: "Videos", path: "/videos", icon: Film, section: "media" },
  { id: "articles", label: "Articles", path: "/articles", icon: BookOpen, section: "reading" },
  { id: "highlights", label: "Highlights", path: "/highlights", icon: Quote, section: "reading" },
  { id: "books", label: "Books", path: "/books", icon: BookMarked, section: "reading" },
  { id: "vines", label: "Shorts", path: "/shorts", icon: Clapperboard, section: "media" },
  { id: "music", label: "Music", path: "/music", icon: Music, section: "media" },
  { id: "podcasts", label: "Podcasts", path: "/podcasts", icon: Podcast, section: "media" },
  { id: "torrents", label: "Torrents", path: "/torrents", icon: Magnet, section: "media" },

  { id: "webxdc", label: "Webxdc", path: "/webxdc", icon: Blocks, section: "tools" },
  { id: "themes", label: "Themes", path: "/themes", icon: Sparkles, section: "personalize" },
  { id: "polls", label: "Polls", path: "/polls", icon: BarChart3, section: "social" },
  { id: "packs", label: "Follow Packs", path: "/packs", icon: PartyPopper, section: "social" },
  { id: "colors", label: "Color Moments", path: "/colors", icon: Palette, section: "fun" },
  { id: "decks", label: "Magic Decks", path: "/decks", icon: CardsIcon, section: "fun" },
  { id: "tarot", label: "Tarot", path: "/tarot", icon: MoonStar, section: "fun" },
  { id: "treasures", label: "Treasures", path: "/treasures", icon: ChestIcon, section: "fun" },
  { id: "quizzes", label: "Quizzes", path: "/quizzes", icon: ClipboardList, section: "fun" },
  { id: "cards", label: "Memory Cards", path: "/memory-cards", icon: Gamepad2, section: "fun" },
  { id: "emojis", label: "Emojis", path: "/emojis", icon: SmilePlus, section: "personalize" },
  { id: "development", label: "Development", path: "/development", icon: Code, section: "tools" },
  { id: "badges", label: "Badges", path: "/badges", icon: Award, section: "fun" },
  { id: "world", label: "World", path: "/world", icon: Earth, section: "social" },
  { id: "archive", label: "Archive", path: "/archive", icon: Archive, section: "reading" },
  { id: "wikipedia", label: "Wikipedia", path: "/wikipedia", icon: WikipediaIcon, section: "reading" },
  { id: "bluesky", label: "Bluesky", path: "/bluesky", icon: BlueskyIcon, section: "social" },
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
  reactions: SmilePlus,
  zaps: Zap,
  voice: Mic,
  "custom-emojis": Smile,
  statuses: SmilePlus,
  "bird-detections": Bird,
  constellations: Stars,
  "custom-nips": FileCode,
  nsites: Rocket,
  zapstore: Package,
  "app-handlers": Blocks,
  vanish: Ghost,
  "love-lists": Heart,
  "top-8": Crown,
  campaigns: HandHeart,
  attestations: ShieldCheck,
  "classified-listings": Tag,
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

/**
 * Translated display label for a sidebar item ID, for use in components.
 * Non-registry IDs (URIs, dividers) pass through untranslated.
 */
export function useItemLabel(id: string): string {
  const intl = useIntl();
  return formatItemLabel(intl, id);
}

/**
 * Translated display label for a sidebar item ID, for use outside of hooks.
 * Non-registry IDs (URIs, dividers) pass through untranslated.
 */
export function formatItemLabel(intl: IntlShape, id: string): string {
  const message = SIDEBAR_ITEM_LABELS[id];
  return message ? intl.formatMessage(message) : itemLabel(id);
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

/**
 * Search sidebar items by label. Matches when the query is a prefix of the
 * full label or of any word within the label (e.g. "arch" matches "Archive"
 * and "Internet Archive" but not "Search"). Whole-label prefix matches are
 * sorted before word-boundary matches. Auth-requiring items are excluded
 * when the user is not logged in. Pass `intl` to match translated labels.
 */
export function searchSidebarItems(
  query: string,
  intl?: IntlShape,
): SidebarItemDef[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const prefixMatches: SidebarItemDef[] = [];
  const wordMatches: SidebarItemDef[] = [];

  for (const item of SIDEBAR_ITEMS) {
    const label = (intl ? formatItemLabel(intl, item.id) : item.label).toLowerCase();
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
  // Nostr URI items: active when pathname matches /<nip19>
  if (isNostrUri(id)) {
    const nip19Id = nostrUriToNip19(id);
    return pathname === `/${nip19Id}`;
  }

  // Nsite URI items: active when the nsite preview is open for this subdomain.
  // The pathname will be the naddr of the nsite event, which we can't cheaply
  // derive here without async resolution. For now, nsite items are never
  // highlighted as "active" via pathname — the visual indication comes from
  // the nsite preview panel being open.
  if (isNsiteUri(id)) {
    return false;
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
