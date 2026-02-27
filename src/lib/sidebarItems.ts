import { getBuiltinItem } from '@/hooks/useFeedSettings';
import { getExtraKindDef } from '@/lib/extraKinds';

/** Lookup display label for a sidebar item ID. */
export function itemLabel(id: string): string {
  const builtin = getBuiltinItem(id);
  if (builtin) return builtin.label;
  return getExtraKindDef(id)?.label ?? id;
}

/** Lookup navigation path for a sidebar item ID. */
export function itemPath(id: string, profilePath?: string): string {
  if (id === 'profile' && profilePath) return profilePath;
  const builtin = getBuiltinItem(id);
  if (builtin) return builtin.path;
  const def = getExtraKindDef(id);
  return def?.route ? `/${def.route}` : `/${id}`;
}

/** Check if a sidebar item is active given the current location. */
export function isItemActive(id: string, pathname: string, search: string, profilePath?: string): boolean {
  if (id === 'feed') return pathname === '/';
  if (id === 'notifications') return pathname === '/notifications';
  if (id === 'search') return pathname === '/search';
  if (id === 'trends') return pathname === '/trends';
  if (id === 'bookmarks') return pathname === '/bookmarks';
  if (id === 'profile') return !!profilePath && pathname === profilePath;
  if (id === 'theme') return pathname === '/settings/theme';
  if (id === 'themes') return pathname === '/themes';
  if (id === 'settings') return pathname.startsWith('/settings') && pathname !== '/settings/theme';
  const def = getExtraKindDef(id);
  return def?.route ? pathname === `/${def.route}` : pathname === `/${id}`;
}
