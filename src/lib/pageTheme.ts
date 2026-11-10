/**
 * The theme each history entry was on screen in, so the copy of the previous
 * page under the current one (see BackSwipe) is painted in that page's theme
 * rather than the one on screen. Themes are document-wide: a themed profile
 * paints its colors, fonts and background over the whole app, so the copy of
 * the feed behind it came up in the profile's theme, and flipped to the
 * user's own when a swipe back landed.
 *
 * Captured from the theme's style elements (AppProvider, useTheme,
 * ProfilePage) as the entry is left, and replayed as CSS scoped to the copy.
 */

/** Stands for the copy's selector in a captured theme. */
const SCOPE = '__page_theme_scope__';

/** Captured themes by history entry key. */
const themes = new Map<string, string>();

/** Most entries kept; a long session would otherwise keep every one. */
const MAX_THEMES = 50;

/** Record the theme on screen for the history entry `key`, which is being left. */
export function capturePageTheme(key: string): void {
  const root = document.documentElement;
  const computed = getComputedStyle(root);
  const vars = document.getElementById('theme-vars')?.textContent ?? '';
  const titleFont = computed.getPropertyValue('--title-font-family').trim();
  const background = document.getElementById('theme-background')?.textContent ?? '';
  const css = [
    vars.replace(/:root/g, SCOPE),
    `${SCOPE} { font-family: ${computed.fontFamily}; --title-font-family: ${titleFont || 'initial'}; background-color: hsl(var(--background)); color: hsl(var(--foreground)); }`,
    background.replace(/\bbody::before\b/g, `${SCOPE}::before`).replace(/\bbody\b/g, SCOPE),
  ].join('\n');

  themes.delete(key);
  themes.set(key, css);
  const oldest = themes.keys().next().value;
  if (themes.size > MAX_THEMES && oldest !== undefined) themes.delete(oldest);
}

/** The theme the entry `key` was left in, as CSS for `selector`, if it was captured. */
export function getPageThemeCss(key: string, selector: string): string | undefined {
  return themes.get(key)?.replaceAll(SCOPE, selector);
}
