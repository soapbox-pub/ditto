import { useSyncExternalStore } from 'react';

/**
 * Text size, as a percentage, published as `--font-scale` on `<html>`. Only
 * font sizes and line heights read it (`postcss.config.js`), so spacing and
 * icons keep their size. Inline `style` font sizes escape it; use `text-*`. Device-wide rather than in the per-account AppConfig: a phone and a
 * desktop rarely want the same size. `public/theme.js` applies it before first
 * paint, so the key is fixed rather than namespaced by `appId`.
 */
export const FONT_SCALE_KEY = 'ditto:font-scale';
export const FONT_SCALE_MIN = 80;
export const FONT_SCALE_MAX = 150;
export const FONT_SCALE_DEFAULT = 100;

function clamp(n: number): number {
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(n)));
}

function read(): number {
  try {
    const n = Number(localStorage.getItem(FONT_SCALE_KEY));
    return n ? clamp(n) : FONT_SCALE_DEFAULT;
  } catch {
    return FONT_SCALE_DEFAULT;
  }
}

let current = read();
const listeners = new Set<() => void>();

export function getFontScale(): number {
  return current;
}

export function setFontScale(pct: number): void {
  const next = clamp(pct);
  if (next === current) return;
  current = next;
  try {
    if (next === FONT_SCALE_DEFAULT) localStorage.removeItem(FONT_SCALE_KEY);
    else localStorage.setItem(FONT_SCALE_KEY, String(next));
  } catch {
    // Private-mode/quota: the size still holds for this session.
  }
  const style = document.documentElement.style;
  if (next === FONT_SCALE_DEFAULT) style.removeProperty('--font-scale');
  else style.setProperty('--font-scale', String(next / 100));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useFontScale(): number {
  return useSyncExternalStore(subscribe, getFontScale);
}
