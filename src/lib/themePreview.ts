import { useEffect, useSyncExternalStore } from 'react';

import type { ThemeConfig } from '@/themes';

/**
 * A theme the user is trying on before committing to it. Lives only in memory:
 * nothing is persisted, synced, or published until the user picks
 * "Use this theme" in the ThemePreviewBar.
 */
export interface ThemePreview {
  /** The theme being tried, including its title and creator credit. */
  config: ThemeConfig;
  /**
   * Whether AppProvider should paint the theme over the user's own. False when
   * the theme is already on screen (e.g. on the creator's profile page, which
   * injects it itself) and only the confirm bar is needed.
   */
  live: boolean;
}

let current: ThemePreview | null = null;
const listeners = new Set<() => void>();

/** Number of mounted pages painting their own theme (e.g. a visited profile). */
let pageOverrides = 0;

function emit() {
  for (const listener of listeners) listener();
}

/**
 * Start (or replace) the theme preview. Previews are live unless a page is
 * painting its own theme, which a live preview would fight with.
 */
export function startThemePreview(config: ThemeConfig, opts: { live?: boolean } = {}): void {
  current = { config, live: opts.live ?? pageOverrides === 0 };
  emit();
}

/** End the theme preview, restoring the user's own theme. */
export function clearThemePreview(): void {
  if (!current) return;
  current = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return current;
}

/** The theme currently being previewed, if any. */
export function useThemePreview(): ThemePreview | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Declare that the calling page paints its own theme while `active`, so previews started there don't. */
export function usePageThemeOverride(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    pageOverrides++;
    return () => {
      pageOverrides--;
    };
  }, [active]);
}
