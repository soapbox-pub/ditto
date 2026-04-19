import type { NostrEvent } from '@nostrify/nostrify';
import type { CoreThemeColors, ThemeConfig, ThemeFont, ThemeBackground } from '@/themes';
import { hslStringToHex, hexToHslString, isValidHex } from '@/lib/colorUtils';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

// ─── Kind Constants ───────────────────────────────────────────────────

/** Addressable event: a shareable, named theme definition. Multiple per user. */
export const THEME_DEFINITION_KIND = 36767;

/** Replaceable event: the user's currently active profile theme. One per user. */
export const ACTIVE_THEME_KIND = 16767;

// ─── Color Tag Helpers ────────────────────────────────────────────────

/** Color role markers used in `c` tags. */
type ColorRole = 'primary' | 'text' | 'background';

/** Build `c` tags from CoreThemeColors (HSL → hex conversion). */
function buildColorTags(colors: CoreThemeColors): string[][] {
  const roles: ColorRole[] = ['background', 'text', 'primary'];
  return roles.map((role) => ['c', hslStringToHex(colors[role]), role]);
}

/**
 * Parse `c` tags into CoreThemeColors.
 * Returns null if any of the 3 required roles are missing.
 */
function parseColorTags(tags: string[][]): CoreThemeColors | null {
  const colorMap = new Map<string, string>();
  for (const tag of tags) {
    if (tag[0] === 'c' && tag[1] && tag[2]) {
      colorMap.set(tag[2], tag[1]);
    }
  }

  const bgHex = colorMap.get('background');
  const textHex = colorMap.get('text');
  const primaryHex = colorMap.get('primary');

  if (!bgHex || !textHex || !primaryHex) return null;
  if (!isValidHex(bgHex) || !isValidHex(textHex) || !isValidHex(primaryHex)) return null;

  return {
    background: hexToHslString(bgHex),
    text: hexToHslString(textHex),
    primary: hexToHslString(primaryHex),
  };
}

// ─── Font Tag Helpers ─────────────────────────────────────────────────

/** Build `f` tags from body and title fonts. Body tag is always ordered before title tag. */
function buildFontTags(font: ThemeFont | undefined, titleFont: ThemeFont | undefined): string[][] {
  const tags: string[][] = [];
  if (font?.family) {
    const tag = ['f', font.family];
    if (font.url) tag.push(font.url); else tag.push('');
    tag.push('body');
    tags.push(tag);
  }
  if (titleFont?.family) {
    const tag = ['f', titleFont.family];
    if (titleFont.url) tag.push(titleFont.url); else tag.push('');
    tag.push('title');
    tags.push(tag);
  }
  return tags;
}

/** Parse `f` tags into body and title ThemeFonts. Legacy tags without a role are treated as body. */
function parseFontTags(tags: string[][]): { font?: ThemeFont; titleFont?: ThemeFont } {
  let font: ThemeFont | undefined;
  let titleFont: ThemeFont | undefined;

  for (const tag of tags) {
    if (tag[0] !== 'f' || !tag[1]) continue;
    const role = tag[3]; // 4th element: "body", "title", or absent (legacy)
    const parsed: ThemeFont = { family: tag[1] };
    const fontUrl = sanitizeUrl(tag[2]);
    if (fontUrl) parsed.url = fontUrl;

    if (role === 'title') {
      if (!titleFont) titleFont = parsed;
    } else {
      // "body" or absent (legacy) — treat as body font
      if (!font) font = parsed;
    }
  }

  return { font, titleFont };
}

// ─── Background Tag Helpers ───────────────────────────────────────────

/** Build a `bg` tag from ThemeBackground (imeta-style variadic). */
function buildBackgroundTag(bg: ThemeBackground | undefined): string[][] {
  if (!bg?.url) return [];

  const entries: string[] = ['bg', `url ${bg.url}`];
  if (bg.mode) entries.push(`mode ${bg.mode}`);
  if (bg.mimeType) entries.push(`m ${bg.mimeType}`);
  if (bg.dimensions) entries.push(`dim ${bg.dimensions}`);
  if (bg.blurhash) entries.push(`blurhash ${bg.blurhash}`);

  return [entries];
}

/** Parse a `bg` tag into ThemeBackground. Returns undefined if no bg tag. */
function parseBackgroundTag(tags: string[][]): ThemeBackground | undefined {
  const bgTag = tags.find(([n]) => n === 'bg');
  if (!bgTag) return undefined;

  const kv = new Map<string, string>();
  for (let i = 1; i < bgTag.length; i++) {
    const entry = bgTag[i];
    const spaceIdx = entry.indexOf(' ');
    if (spaceIdx === -1) continue;
    kv.set(entry.slice(0, spaceIdx), entry.slice(spaceIdx + 1));
  }

  const rawUrl = kv.get('url');
  const url = sanitizeUrl(rawUrl);
  if (!url) return undefined;

  const bg: ThemeBackground = { url };
  const mode = kv.get('mode');
  if (mode === 'cover' || mode === 'tile') bg.mode = mode;
  bg.mimeType = kv.get('m');
  bg.dimensions = kv.get('dim');
  bg.blurhash = kv.get('blurhash');

  return bg;
}

// ─── Theme Definition (Kind 36767) ────────────────────────────────────

export interface ThemeDefinition {
  /** The d-tag identifier (slug) */
  identifier: string;
  /** Theme title */
  title: string;
  /** Optional description */
  description?: string;
  /** The 3 core theme colors */
  colors: CoreThemeColors;
  /** Optional custom body font */
  font?: ThemeFont;
  /** Optional title/header font (profile display name) */
  titleFont?: ThemeFont;
  /** Optional background */
  background?: ThemeBackground;
  /** The original Nostr event */
  event: NostrEvent;
}

/** Parse and validate a kind 36767 theme definition event. Returns null if invalid. */
export function parseThemeDefinition(event: NostrEvent): ThemeDefinition | null {
  if (event.kind !== THEME_DEFINITION_KIND) return null;

  const identifier = event.tags.find(([n]) => n === 'd')?.[1];
  if (!identifier) return null;

  const title = event.tags.find(([n]) => n === 'title')?.[1];
  if (!title) return null;

  const description = event.tags.find(([n]) => n === 'description')?.[1];

  // Try new format: colors in `c` tags, content is empty
  let colors = parseColorTags(event.tags);

  // Fall back to legacy format: colors as JSON in content
  if (!colors && event.content) {
    try {
      const parsed = JSON.parse(event.content);
      colors = normalizeLegacyColors(parsed);
    } catch {
      // Invalid JSON
    }
  }

  if (!colors) return null;

  const { font, titleFont } = parseFontTags(event.tags);
  const background = parseBackgroundTag(event.tags);

  return { identifier, title, description, colors, font, titleFont, background, event };
}

/** Create tags for a kind 36767 theme definition event. */
export function buildThemeDefinitionTags(
  identifier: string,
  title: string,
  themeConfig: ThemeConfig,
  description?: string,
): string[][] {
  const tags: string[][] = [
    ['d', identifier],
    ...buildColorTags(themeConfig.colors),
    ...buildFontTags(themeConfig.font, themeConfig.titleFont),
    ...buildBackgroundTag(themeConfig.background),
    ['title', title],
    ['alt', `Custom theme: ${title}`],
    ['t', 'theme'],
  ];
  if (description) {
    tags.push(['description', description]);
  }
  return tags;
}

/** Generate a URL-safe slug from a title. */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 64);
}

// ─── Active Profile Theme (Kind 16767) ────────────────────────────────

export interface ActiveProfileTheme {
  /** The 3 core theme colors */
  colors: CoreThemeColors;
  /** Optional custom body font */
  font?: ThemeFont;
  /** Optional title/header font (profile display name) */
  titleFont?: ThemeFont;
  /** Optional background */
  background?: ThemeBackground;
  /** naddr-style reference to the source theme definition, if any */
  sourceRef?: string;
  /** The original Nostr event */
  event: NostrEvent;
}

/** Parse and validate a kind 16767 active profile theme event. Returns null if invalid. */
export function parseActiveProfileTheme(event: NostrEvent): ActiveProfileTheme | null {
  if (event.kind !== ACTIVE_THEME_KIND) return null;

  // Try new format: colors in `c` tags
  let colors = parseColorTags(event.tags);

  // Fall back to legacy format: colors as JSON in content
  if (!colors && event.content) {
    try {
      const parsed = JSON.parse(event.content);
      colors = normalizeLegacyColors(parsed);
    } catch {
      // Invalid JSON
    }
  }

  if (!colors) return null;

  const { font, titleFont } = parseFontTags(event.tags);
  const background = parseBackgroundTag(event.tags);
  const sourceRef = event.tags.find(([n]) => n === 'a')?.[1];

  return { colors, font, titleFont, background, sourceRef, event };
}

/** Create tags for a kind 16767 active profile theme event. */
export function buildActiveThemeTags(
  themeConfig: ThemeConfig,
  sourceAuthor?: string,
  sourceIdentifier?: string,
  description?: string,
): string[][] {
  const tags: string[][] = [
    ...buildColorTags(themeConfig.colors),
    ...buildFontTags(themeConfig.font, themeConfig.titleFont),
    ...buildBackgroundTag(themeConfig.background),
    ['alt', 'Active profile theme'],
  ];
  if (themeConfig.title) {
    tags.push(['title', themeConfig.title]);
  }
  if (description) {
    tags.push(['description', description]);
  }
  if (sourceAuthor && sourceIdentifier) {
    tags.push(['a', `${THEME_DEFINITION_KIND}:${sourceAuthor}:${sourceIdentifier}`]);
  }
  return tags;
}

// ─── Backward Compatibility ───────────────────────────────────────────

/**
 * Normalize a parsed JSON object to CoreThemeColors (legacy format).
 * Handles:
 *   - Current format: { background, text, primary }
 *   - Old 4-color format: { background, text, primary, secondary } (secondary dropped)
 *   - Legacy 19-token format: { background, foreground, primary, ... }
 */
function normalizeLegacyColors(parsed: Record<string, unknown>): CoreThemeColors | null {
  // Current or old 4-color format (both have background + text + primary)
  if (parsed.background && parsed.text && parsed.primary) {
    return {
      background: String(parsed.background),
      text: String(parsed.text),
      primary: String(parsed.primary),
    };
  }

  // Legacy 19-token format (background, foreground, primary, ...)
  if (parsed.background && parsed.foreground && parsed.primary) {
    return {
      background: String(parsed.background),
      text: String(parsed.foreground),
      primary: String(parsed.primary),
    };
  }

  return null;
}
