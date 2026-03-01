import {
  Clapperboard, BarChart3, Palette, PartyPopper, Radio, BookOpen, Sparkles, Blocks,
  MessageSquare, Repeat2, MessageSquareMore,
} from 'lucide-react';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Icon components for extra-kind sidebar items and the content settings UI.
 * This is the single source of truth for extra-kind icons.
 * Built-in system item icons live in SidebarNavItem.tsx.
 */
export const EXTRA_KIND_ICONS: Record<string, IconComponent> = {
  // Feed kinds
  posts: MessageSquare,
  comments: MessageSquareMore,
  reposts: Repeat2,
  'generic-reposts': Repeat2,
  articles: BookOpen,
  // Media
  vines: Clapperboard,
  streams: Radio,
  // Social
  webxdc: Blocks,
  themes: Sparkles,
  polls: BarChart3,
  packs: PartyPopper,
  // Whimsy
  colors: Palette,
  decks: CardsIcon,
  treasures: ChestIcon,
};
