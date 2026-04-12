import type { ComponentType } from 'react';
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
} from 'lucide-react';
import { WikipediaIcon } from '@/components/icons/WikipediaIcon';
import { BlueskyIcon } from '@/components/icons/BlueskyIcon';

// ── Types ─────────────────────────────────────────────────────────────────────

type IconComponent = ComponentType<{ className?: string }>;

/** Metadata for a widget type that can be added to the right sidebar. */
export interface WidgetDefinition {
  /** Unique identifier matching WidgetConfig.id */
  id: string;
  /** Display label shown in the widget header and picker. */
  label: string;
  /** Short description for the widget picker. */
  description: string;
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
    label: 'Trending',
    description: 'Top trending hashtags with sparkline charts',
    icon: TrendingUp,
    defaultHeight: 320,
    minHeight: 200,
    maxHeight: 600,
    category: 'discovery',
    href: '/trends',
  },
  {
    id: 'hot-posts',
    label: 'Hot Posts',
    description: 'Top posts from the Hot feed',
    icon: Flame,
    defaultHeight: 350,
    minHeight: 200,
    maxHeight: 600,
    category: 'discovery',
    href: '/trends',
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    description: "Today's featured article from Wikipedia",
    icon: WikipediaIcon,
    defaultHeight: 350,
    minHeight: 200,
    maxHeight: 600,
    category: 'discovery',
    href: '/wikipedia',
  },
  {
    id: 'bluesky',
    label: 'Bluesky',
    description: 'Trending posts from Bluesky',
    icon: BlueskyIcon,
    defaultHeight: 400,
    minHeight: 250,
    maxHeight: 700,
    category: 'discovery',
    href: '/bluesky',
  },

  // Personal
  {
    id: 'blobbi',
    label: 'Blobbi',
    description: 'Your virtual pet companion',
    icon: Egg,
    defaultHeight: 350,
    minHeight: 200,
    maxHeight: 500,
    category: 'personal',
    href: '/blobbi',
  },
  {
    id: 'status',
    label: 'Status',
    description: 'Your current status, editable inline',
    icon: SmilePlus,
    defaultHeight: 80,
    minHeight: 60,
    maxHeight: 120,
    category: 'personal',
    href: '/profile',
  },
  {
    id: 'ai-chat',
    label: 'AI Chat',
    description: 'Chat with Shakespeare AI',
    icon: Bot,
    defaultHeight: 400,
    minHeight: 250,
    maxHeight: 700,
    category: 'personal',
    href: '/ai-chat',
    fillHeight: true,
  },

  // Content feeds
  {
    id: 'feed:photos',
    label: 'Photos',
    description: 'Recent photos from your feed',
    icon: Camera,
    defaultHeight: 400,
    minHeight: 250,
    maxHeight: 700,
    category: 'content',
    href: '/photos',
  },
  {
    id: 'feed:music',
    label: 'Music',
    description: 'Music tracks from your feed',
    icon: Music,
    defaultHeight: 350,
    minHeight: 250,
    maxHeight: 700,
    category: 'content',
    href: '/music',
  },
  {
    id: 'feed:articles',
    label: 'Articles',
    description: 'Long-form articles from your feed',
    icon: ScrollText,
    defaultHeight: 350,
    minHeight: 250,
    maxHeight: 700,
    category: 'content',
    href: '/articles',
  },
  {
    id: 'feed:events',
    label: 'Events',
    description: 'Upcoming calendar events',
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

/** Lookup a widget definition by ID. */
export function getWidgetDefinition(id: string): WidgetDefinition | undefined {
  return WIDGET_MAP.get(id);
}

/** Category labels for display in the picker. */
export const WIDGET_CATEGORIES: Record<string, string> = {
  personal: 'Personal',
  content: 'Content',
  discovery: 'Discovery',
};
