import type { ComponentType } from 'react';
import { defineMessage, defineMessages, useIntl, type MessageDescriptor } from 'react-intl';
import {
  TrendingUp,
  Flame,
  Egg,
  SmilePlus,
  Bot,
  Camera,
  Music,
  CalendarDays,
  ScrollText,
  BarChart3,
} from 'lucide-react';
import { WikipediaIcon } from '@/components/icons/WikipediaIcon';
import { BlueskyIcon } from '@/components/icons/BlueskyIcon';
import type { WidgetConfig } from '@/contexts/AppContext';

// ── Types ─────────────────────────────────────────────────────────────────────

type IconComponent = ComponentType<{ className?: string }>;

/** Metadata for a widget type that can be added to the right sidebar. */
export interface WidgetDefinition {
  /** Unique identifier matching WidgetConfig.id */
  id: string;
  /** Display label shown in the widget header and picker. */
  label: MessageDescriptor;
  /** Short description for the widget picker. */
  description: MessageDescriptor;
  /** Icon component for the widget header and picker. */
  icon: IconComponent;
  /** Default height in pixels. */
  defaultHeight: number;
  /** Minimum height in pixels. */
  minHeight: number;
  /** Maximum height in pixels. */
  maxHeight: number;
  /** Category for grouping in the picker. */
  category: 'personal' | 'content' | 'discovery';
  /** Optional internal route the header links to. */
  href?: string;
  /** When true, the widget uses a fixed height instead of max-height, allowing internal flex layouts to fill the container. */
  fillHeight?: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────────────

/** All available widget definitions. */
export const WIDGET_DEFINITIONS: WidgetDefinition[] = [
  // Discovery
  {
    id: 'trends',
    label: defineMessage({ id: 'widgets.trending.title', defaultMessage: 'Trending' }),
    description: defineMessage({ id: 'widgets.trending.description', defaultMessage: 'Top trending hashtags with sparkline charts' }),
    icon: TrendingUp,
    defaultHeight: 320,
    minHeight: 200,
    maxHeight: 600,
    category: 'discovery',
    href: '/trends',
  },
  {
    id: 'hot-posts',
    label: defineMessage({ id: 'widgets.hotPosts.title', defaultMessage: 'Hot Posts' }),
    description: defineMessage({ id: 'widgets.hotPosts.description', defaultMessage: 'Top posts from the Hot feed' }),
    icon: Flame,
    defaultHeight: 350,
    minHeight: 200,
    maxHeight: 600,
    category: 'discovery',
    href: '/trends',
  },
  {
    id: 'wikipedia',
    label: defineMessage({ id: 'widgets.wikipedia.title', defaultMessage: 'Wikipedia' }),
    description: defineMessage({ id: 'widgets.wikipedia.description', defaultMessage: "Today's featured article from Wikipedia" }),
    icon: WikipediaIcon,
    defaultHeight: 350,
    minHeight: 200,
    maxHeight: 600,
    category: 'discovery',
    href: '/wikipedia',
  },
  {
    id: 'bluesky',
    label: defineMessage({ id: 'widgets.bluesky.title', defaultMessage: 'Bluesky' }),
    description: defineMessage({ id: 'widgets.bluesky.description', defaultMessage: 'Trending posts from Bluesky' }),
    icon: BlueskyIcon,
    defaultHeight: 400,
    minHeight: 250,
    maxHeight: 700,
    category: 'discovery',
    href: '/bluesky',
  },
  {
    id: 'nostr-clients',
    label: defineMessage({ id: 'widgets.nostrClients.title', defaultMessage: 'Nostr Clients' }),
    description: defineMessage({ id: 'widgets.nostrClients.description', defaultMessage: 'Distinct authors per client over the last 30 days' }),
    icon: BarChart3,
    defaultHeight: 300,
    minHeight: 200,
    maxHeight: 500,
    category: 'discovery',
    href: '/trends',
  },

  // Personal
  {
    id: 'blobbi',
    label: defineMessage({ id: 'widgets.blobbi.title', defaultMessage: 'Blobbi' }),
    description: defineMessage({ id: 'widgets.blobbi.description', defaultMessage: 'Your virtual pet companion' }),
    icon: Egg,
    defaultHeight: 350,
    minHeight: 200,
    maxHeight: 500,
    category: 'personal',
    href: '/blobbi',
  },
  {
    id: 'status',
    label: defineMessage({ id: 'widgets.status.title', defaultMessage: 'Status' }),
    description: defineMessage({ id: 'widgets.status.description', defaultMessage: 'Your current status, editable inline' }),
    icon: SmilePlus,
    defaultHeight: 80,
    minHeight: 60,
    maxHeight: 120,
    category: 'personal',
    href: '/profile',
  },
  {
    id: 'ai-chat',
    label: defineMessage({ id: 'widgets.aiChat.title', defaultMessage: 'AI Chat' }),
    description: defineMessage({ id: 'widgets.aiChat.description', defaultMessage: 'Chat with Shakespeare AI' }),
    icon: Bot,
    defaultHeight: 300,
    minHeight: 200,
    maxHeight: 700,
    category: 'personal',
    href: '/ai-chat',
    fillHeight: true,
  },

  // Content feeds
  {
    id: 'feed:photos',
    label: defineMessage({ id: 'widgets.photo.title', defaultMessage: 'Photos' }),
    description: defineMessage({ id: 'widgets.photo.description', defaultMessage: 'Recent photos from your feed' }),
    icon: Camera,
    defaultHeight: 400,
    minHeight: 250,
    maxHeight: 700,
    category: 'content',
    href: '/photos',
  },
  {
    id: 'feed:music',
    label: defineMessage({ id: 'widgets.music.title', defaultMessage: 'Music' }),
    description: defineMessage({ id: 'widgets.music.description', defaultMessage: 'Music tracks from your feed' }),
    icon: Music,
    defaultHeight: 350,
    minHeight: 250,
    maxHeight: 700,
    category: 'content',
    href: '/music',
  },
  {
    id: 'feed:articles',
    label: defineMessage({ id: 'widgets.articles.title', defaultMessage: 'Articles' }),
    description: defineMessage({ id: 'widgets.articles.description', defaultMessage: 'Long-form articles from your feed' }),
    icon: ScrollText,
    defaultHeight: 350,
    minHeight: 250,
    maxHeight: 700,
    category: 'content',
    href: '/articles',
  },
  {
    id: 'feed:events',
    label: defineMessage({ id: 'widgets.events.title', defaultMessage: 'Events' }),
    description: defineMessage({ id: 'widgets.events.description', defaultMessage: 'Upcoming calendar events' }),
    icon: CalendarDays,
    defaultHeight: 300,
    minHeight: 200,
    maxHeight: 600,
    category: 'content',
    href: '/events',
  },

];

/** Pre-built Map for O(1) widget definition lookup. */
const WIDGET_MAP = new Map(WIDGET_DEFINITIONS.map((w) => [w.id, w]));

/**
 * Default right-sidebar widgets for fresh installs / accounts with no
 * synced widget config. Kept here so both the AppConfig default and the
 * account-switch reset in NostrSync reference a single source of truth.
 */
export const DEFAULT_SIDEBAR_WIDGETS: WidgetConfig[] = [
  { id: 'trends' },
  { id: 'hot-posts' },
  { id: 'wikipedia' },
];

/** Lookup a widget definition by ID. */
export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return WIDGET_MAP.get(id);
}

/** Category labels for display in the picker. */
export const WIDGET_CATEGORIES: Record<WidgetDefinition['category'], MessageDescriptor> = defineMessages({
  personal: { id: 'widgets.categories.personal', defaultMessage: 'Personal' },
  content: { id: 'widgets.categories.content', defaultMessage: 'Content' },
  discovery: { id: 'widgets.categories.discovery', defaultMessage: 'Discovery' },
});

/**
 * Translated display label for a widget ID, for use in components.
 * Unknown IDs pass through untranslated.
 */
export function useWidgetLabel(id: string): string {
  const intl = useIntl();
  const def = WIDGET_MAP.get(id);
  return def ? intl.formatMessage(def.label) : id;
}

/** Translated description for a widget ID, for use in the widget picker. */
export function useWidgetDescription(id: string): string {
  const intl = useIntl();
  const def = WIDGET_MAP.get(id);
  return def ? intl.formatMessage(def.description) : '';
}

/** Translated category label for the widget picker. */
export function useWidgetCategoryLabel(category: WidgetDefinition['category']): string {
  const intl = useIntl();
  return intl.formatMessage(WIDGET_CATEGORIES[category]);
}
