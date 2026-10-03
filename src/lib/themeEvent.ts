import type { NostrEvent } from '@nostrify/nostrify';
import type { CoreThemeColors, ThemeConfig, ThemeFont, ThemeBackground, ThemeSource } from '@/themes';
import { hslStringToHex, hexToHslString, isValidHex } from '@/lib/colorUtils';
import { isNostrId } from '@/lib/nostrId';
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

  // Colors live in `c` tags (hex, validated). No other source is trusted.
  const colors = parseColorTags(event.tags);
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
  /** Optional theme name */
  title?: string;
  /** Optional description */
  description?: string;
  /** naddr-style reference to the source theme definition, if any */
  sourceRef?: string;
  /** The theme's original creator, when it was adopted from another user */
  source?: ThemeSource;
  /** The original Nostr event */
  event: NostrEvent;
}

/**
 * Read the original creator of an adopted theme from a kind 16767 event.
 * Prefers a well-formed `a` tag (36767:<pubkey>:<d>), falling back to a `p` tag.
 * Returns undefined when the event's own author is the creator.
 */
function parseThemeSource(event: NostrEvent): ThemeSource | undefined {
  let source: ThemeSource | undefined;

  const aRef = event.tags.find(([n]) => n === 'a')?.[1];
  if (aRef) {
    const [kind, pubkey, ...rest] = aRef.split(':');
    const identifier = rest.join(':');
    if (kind === String(THEME_DEFINITION_KIND) && isNostrId(pubkey) && identifier) {
      source = { pubkey, identifier };
    }
  }

  if (!source) {
    const pubkey = event.tags.find(([n]) => n === 'p')?.[1];
    if (pubkey && isNostrId(pubkey)) source = { pubkey };
  }

  return source && source.pubkey !== event.pubkey ? source : undefined;
}

/** Parse and validate a kind 16767 active profile theme event. Returns null if invalid. */
export function parseActiveProfileTheme(event: NostrEvent): ActiveProfileTheme | null {
  if (event.kind !== ACTIVE_THEME_KIND) return null;

  // Colors live in `c` tags (hex, validated). No other source is trusted.
  const colors = parseColorTags(event.tags);
  if (!colors) return null;

  const { font, titleFont } = parseFontTags(event.tags);
  const background = parseBackgroundTag(event.tags);
  const title = event.tags.find(([n]) => n === 'title')?.[1];
  const description = event.tags.find(([n]) => n === 'description')?.[1];
  const sourceRef = event.tags.find(([n]) => n === 'a')?.[1];
  const source = parseThemeSource(event);

  return { colors, font, titleFont, background, title, description, sourceRef, source, event };
}

/** Create tags for a kind 16767 active profile theme event. Credits `themeConfig.source` with `a`/`p` tags. */
export function buildActiveThemeTags(
  themeConfig: ThemeConfig,
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
  const { source } = themeConfig;
  if (source) {
    if (source.identifier) {
      tags.push(['a', `${THEME_DEFINITION_KIND}:${source.pubkey}:${source.identifier}`]);
    }
    tags.push(['p', source.pubkey]);
  }
  return tags;
}

/**
 * Turn a theme event (36767 definition or 16767 active theme) into a ThemeConfig
 * the viewer can adopt, crediting its creator. Returns null if the event is invalid.
 *
 * The creator is the definition's author, or for a 16767 the theme's original
 * source if it was itself adopted, else the 16767's author.
 */
export function themeEventToConfig(event: NostrEvent): ThemeConfig | null {
  if (event.kind === THEME_DEFINITION_KIND) {
    const def = parseThemeDefinition(event);
    if (!def) return null;
    return {
      colors: def.colors,
      title: def.title,
      font: def.font,
      titleFont: def.titleFont,
      background: def.background,
      source: { pubkey: event.pubkey, identifier: def.identifier },
    };
  }
  if (event.kind === ACTIVE_THEME_KIND) {
    const active = parseActiveProfileTheme(event);
    if (!active) return null;
    return activeThemeToConfig(active, active.source ?? { pubkey: event.pubkey });
  }
  return null;
}

/** Convert a parsed kind 16767 into a ThemeConfig, attaching the given source credit. */
export function activeThemeToConfig(active: ActiveProfileTheme, source: ThemeSource | undefined = active.source): ThemeConfig {
  return {
    colors: active.colors,
    ...(active.title && { title: active.title }),
    ...(active.font && { font: active.font }),
    ...(active.titleFont && { titleFont: active.titleFont }),
    ...(active.background && { background: active.background }),
    ...(source && { source }),
  };
}

/** Whether a kind 16767 is someone wearing another user's theme, rather than a theme they made. */
export function isAdoptedActiveTheme(event: NostrEvent): boolean {
  return event.kind === ACTIVE_THEME_KIND && !!parseThemeSource(event);
}

