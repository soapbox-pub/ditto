/**
 * Font loading utilities.
 *
 * Handles loading fonts from:
 * 1. Bundled fontsource packages (via dynamic import)
 * 2. Remote URLs (via @font-face injection)
 *
 * Also manages the CSS override that applies a custom font to the document.
 */

import type { ThemeFont } from '@/themes';
import { findBundledFont, loadBundledFont, resolveCssFamily } from '@/lib/fonts';

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
 * Apply a font-family override to the document.
 * The font applies globally to the html element (cascades to everything).
 *
 * Pass undefined to clear the override.
 */
export function applyFontOverride(font: ThemeFont | undefined): void {
  let style = document.getElementById(FONT_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;

  if (!font) {
    // No custom font — remove override
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = FONT_OVERRIDE_STYLE_ID;
    document.head.appendChild(style);
  }

  const cssFamily = resolveCssFamily(font.family);
  style.textContent = `html { font-family: "${cssFamily}", ${DEFAULT_FONT_STACK} !important; }\n`;
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
 * Load a theme font and apply the CSS override.
 * This is the main entry point for applying a theme font.
 */
export async function loadAndApplyFont(font: ThemeFont | undefined): Promise<void> {
  if (!font) {
    applyFontOverride(undefined);
    return;
  }

  await loadFont(font.family, font.url);
  applyFontOverride(font);
}

// ─── Title Font CSS Override ──────────────────────────────────────────

/** Style element ID for title font CSS custom property. */
const TITLE_FONT_OVERRIDE_STYLE_ID = 'theme-title-font-overrides';

/**
 * Apply a CSS custom property `--title-font-family` to the document.
 * Components that render the profile display name read this variable.
 *
 * Pass undefined to clear the override.
 */
export function applyTitleFontOverride(font: ThemeFont | undefined): void {
  let style = document.getElementById(TITLE_FONT_OVERRIDE_STYLE_ID) as HTMLStyleElement | null;

  if (!font) {
    style?.remove();
    return;
  }

  if (!style) {
    style = document.createElement('style');
    style.id = TITLE_FONT_OVERRIDE_STYLE_ID;
    document.head.appendChild(style);
  }

  const cssFamily = resolveCssFamily(font.family);
  style.textContent = `:root { --title-font-family: "${cssFamily}", ${DEFAULT_FONT_STACK}; }\n`;
}

/**
 * Load a title font and apply the CSS custom property override.
 */
export async function loadAndApplyTitleFont(font: ThemeFont | undefined): Promise<void> {
  if (!font) {
    applyTitleFontOverride(undefined);
    return;
  }

  await loadFont(font.family, font.url);
  applyTitleFontOverride(font);
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
