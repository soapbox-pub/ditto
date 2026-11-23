import type { ComponentType } from 'react';
import { Compass, UsersRound } from 'lucide-react';

/** An icon a `TabButton` shows while it's active. */
export type TabIcon = ComponentType<{ className?: string }>;

/** Icons for the tabs most feed pages share, so every page draws them alike. */
export const FOLLOWS_TAB_ICON: TabIcon = UsersRound;
export const DISCOVER_TAB_ICON: TabIcon = Compass;
