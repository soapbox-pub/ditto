import {
  Clapperboard, BarChart3, Palette, PartyPopper, Radio, BookOpen, Sparkles, Blocks,
} from 'lucide-react';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';

type IconComponent = React.ComponentType<{ className?: string }>;

/**
 * Icon components for extra-kind sidebar items.
 * This is the single source of truth for extra-kind icons.
 * Built-in system item icons live in SidebarNavItem.tsx.
 */
export const EXTRA_KIND_ICONS: Record<string, IconComponent> = {
  articles: BookOpen,
  vines: Clapperboard,
  streams: Radio,
  webxdc: Blocks,
  themes: Sparkles,
  polls: BarChart3,
  packs: PartyPopper,
  colors: Palette,
  decks: CardsIcon,
  treasures: ChestIcon,
};
