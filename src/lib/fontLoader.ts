/**
 * Font loading utilities.
 *
 * Handles loading fonts from:
 * 1. Bundled fontsource packages (via dynamic import)
 * 2. Remote URLs (via @font-face injection)
 *
 * Also manages the CSS overrides that apply title/body fonts to the document.
 */

import type { ThemeFonts } from '@/themes';
import { findBundledFont, loadBundledFont } from '@/lib/fonts';

// ─── @font-face injection for remote fonts ────────────────────────────

/** Style element ID for injected @font-face rules. */
const FONT_FACE_STYLE_ID = 'theme-font-faces';

/** Tracks which remote font URLs have already been injected. */
const injectedUrls = new Set<string>();

/**
 * Inject a @font-face rule for a remote font URL.
 * Idempotent — won't inject the same URL twice.
 */
function injectFontFace(family: string, url: string): void {
  if (injectedUrls.has(url)) return;

  let style = document.getElementById(FONT_FACE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = FONT_FACE_STYLE_ID;
    document.head.appendChild(style);
  }

  const rule = `
@font-face {
  font-family: "${family}";
  src: url("${url}");
  font-display: swap;
}`;

  style.textContent += rule;
  injectedUrls.add(url);
}

// ─── Font override CSS ───────────────────────────────────────────────

/** Style element ID for font-family overrides. */
const FONT_OVERRIDE_STYLE_ID = 'theme-font-overrides';

/** Default font stack when no custom font is set. */
const DEFAULT_FONT_STACK = '"Inter Variable", Inter, system-ui, sans-serif';

/**
 * Apply font-family overrides to the document.
 * - Title font applies to headings (h1–h6) and elements with data-font="title".
 * - Body font applies to the html element (cascades to everything else).
 *
 * Pass undefined to clear all overrides.
 */
export function applyFontOverrides(fonts: ThemeFonts | undefined): void {
  let style = document.getElementById(FONT_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;

  if (!fonts || (!fonts.title && !fonts.body)) {
    // No custom fonts — remove overrides
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = FONT_OVERRIDE_STYLE_ID;
    document.head.appendChild(style);
  }

  let css = '';

  if (fonts.body) {
    css += `html { font-family: "${fonts.body.family}", ${DEFAULT_FONT_STACK} !important; }\n`;
  }

  if (fonts.title) {
    css += `h1, h2, h3, h4, h5, h6, [data-font="title"] { font-family: "${fonts.title.family}", ${DEFAULT_FONT_STACK} !important; }\n`;
  }

  style.textContent = css;
}

/**
 * Remove all font overrides and injected @font-face rules.
 */
export function clearFontOverrides(): void {
  document.getElementById(FONT_OVERRIDE_STYLE_ID)?.remove();
}

// ─── High-level font loading ──────────────────────────────────────────

/**
 * Load a single font by family name and optional URL.
 * Tries bundled fonts first, falls back to remote URL injection.
 */
export async function loadFont(family: string, url?: string): Promise<void> {
  // Try bundled font first
  const loaded = await loadBundledFont(family);
  if (loaded) return;

  // Fall back to remote URL if provided
  if (url) {
    injectFontFace(family, url);
  }
}

/**
 * Load all fonts specified in a ThemeFonts config and apply CSS overrides.
 * This is the main entry point for applying theme fonts.
 */
export async function loadAndApplyFonts(fonts: ThemeFonts | undefined): Promise<void> {
  if (!fonts) {
    applyFontOverrides(undefined);
    return;
  }

  // Load fonts in parallel
  const loads: Promise<void>[] = [];
  if (fonts.title) {
    loads.push(loadFont(fonts.title.family, fonts.title.url));
  }
  if (fonts.body) {
    loads.push(loadFont(fonts.body.family, fonts.body.url));
  }

  await Promise.allSettled(loads);

  // Apply CSS overrides after fonts are loaded
  applyFontOverrides(fonts);
}

/**
 * Resolve font URLs for publishing to Nostr.
 * For bundled fonts, returns the CDN URL. For others, preserves the existing URL.
 */
export function resolveFontUrl(family: string, existingUrl?: string): string | undefined {
  const bundled = findBundledFont(family);
  if (bundled) return bundled.cdnUrl;
  return existingUrl;
}
