import {
  Bell, Search, TrendingUp, User, Bookmark, Settings, SwatchBook, Palette,
  Clapperboard, BarChart3, PartyPopper, Radio, BookOpen, Sparkles, Blocks,
  MessageSquare, Repeat2, MessageSquareMore, Mic, ImageIcon,
} from 'lucide-react';
import { PlanetIcon } from '@/components/icons/PlanetIcon';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';

// ── Types ─────────────────────────────────────────────────────────────────────

type IconComponent = React.ComponentType<{ className?: string }>;

/** A sidebar-capable item with everything needed for display and navigation. */
export interface SidebarItemDef {
  /** Unique identifier stored in sidebarOrder. */
  id: string;
  /** Display label. */
  label: string;
  /** Navigation path (e.g. '/', '/notifications', '/vines'). */
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
  { id: 'feed', label: 'Feed', path: '/', icon: PlanetIcon },
  { id: 'notifications', label: 'Notifications', path: '/notifications', icon: Bell, requiresAuth: true },
  { id: 'search', label: 'Search', path: '/search', icon: Search },
  { id: 'trends', label: 'Trends', path: '/trends', icon: TrendingUp },
  { id: 'bookmarks', label: 'Bookmarks', path: '/bookmarks', icon: Bookmark, requiresAuth: true },
  { id: 'profile', label: 'Profile', path: '/profile', icon: User, requiresAuth: true },
  { id: 'settings', label: 'Settings', path: '/settings', icon: Settings },
  { id: 'theme', label: 'Vibe', path: '/settings/theme', icon: SwatchBook },
  // Content types
  { id: 'pictures', label: 'Pictures', path: '/pictures', icon: ImageIcon },
  { id: 'articles', label: 'Articles', path: '/articles', icon: BookOpen },
  { id: 'vines', label: 'Vines', path: '/vines', icon: Clapperboard },
  { id: 'streams', label: 'Streams', path: '/streams', icon: Radio },
  { id: 'webxdc', label: 'Webxdc', path: '/webxdc', icon: Blocks },
  { id: 'themes', label: 'Themes', path: '/themes', icon: Sparkles },
  { id: 'polls', label: 'Polls', path: '/polls', icon: BarChart3 },
  { id: 'packs', label: 'Follow Packs', path: '/packs', icon: PartyPopper },
  { id: 'colors', label: 'Color Moments', path: '/colors', icon: Palette },
  { id: 'decks', label: 'Magic Decks', path: '/decks', icon: CardsIcon },
  { id: 'treasures', label: 'Treasures', path: '/treasures', icon: ChestIcon },
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
  'generic-reposts': Repeat2,
  voice: Mic,
  ...Object.fromEntries(SIDEBAR_ITEMS.filter((s) => s.icon).map((s) => [s.id, s.icon])),
};

// ── Lookups ───────────────────────────────────────────────────────────────────

/** Get the sidebar item definition by ID, or undefined if unknown. */
export function getSidebarItem(id: string): SidebarItemDef | undefined {
  return SIDEBAR_ITEM_MAP.get(id);
}

/** Returns the icon element for a sidebar item ID at the given size. */
export function sidebarItemIcon(id: string, size = 'size-6'): React.ReactElement {
  const Icon = SIDEBAR_ITEM_MAP.get(id)?.icon ?? Palette;
  return <Icon className={size} />;
}

/** Lookup display label for a sidebar item ID. */
export function itemLabel(id: string): string {
  return SIDEBAR_ITEM_MAP.get(id)?.label ?? id;
}

/** Lookup navigation path for a sidebar item ID. */
export function itemPath(id: string, profilePath?: string): string {
  if (id === 'profile' && profilePath) return profilePath;
  return SIDEBAR_ITEM_MAP.get(id)?.path ?? `/${id}`;
}

/** Check if a sidebar item is active given the current location. */
export function isItemActive(id: string, pathname: string, _search: string, profilePath?: string): boolean {
  if (id === 'profile') return !!profilePath && pathname === profilePath;
  // Settings matches /settings/* but not /settings/theme (theme has its own item).
  if (id === 'settings') return pathname.startsWith('/settings') && pathname !== '/settings/theme';

  const item = SIDEBAR_ITEM_MAP.get(id);
  if (!item) return pathname === `/${id}`;
  return pathname === item.path;
}
