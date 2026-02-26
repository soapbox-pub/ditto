import type { NostrEvent } from '@nostrify/nostrify';
import type { CoreThemeColors } from '@/themes';

// ─── Kind Constants ───────────────────────────────────────────────────

/** Addressable event: a shareable, named theme definition. Multiple per user. */
export const THEME_DEFINITION_KIND = 33891;

/** Replaceable event: the user's currently active profile theme. One per user. */
export const ACTIVE_THEME_KIND = 11667;

// ─── Theme Definition (Kind 33891) ────────────────────────────────────

export interface ThemeDefinition {
  /** The d-tag identifier (slug) */
  identifier: string;
  /** Theme title */
  title: string;
  /** Optional description */
  description?: string;
  /** The 4 core theme colors */
  colors: CoreThemeColors;
  /** The original Nostr event */
  event: NostrEvent;
}


/** Parse and validate a kind 33891 theme definition event. Returns null if invalid. */
export function parseThemeDefinition(event: NostrEvent): ThemeDefinition | null {
  if (event.kind !== THEME_DEFINITION_KIND) return null;

  const identifier = event.tags.find(([n]) => n === 'd')?.[1];
  if (!identifier) return null;

  const title = event.tags.find(([n]) => n === 'title')?.[1];
  if (!title) return null;

  const description = event.tags.find(([n]) => n === 'description')?.[1];

  try {
    const parsed = JSON.parse(event.content);

    // Accept both new CoreThemeColors format and legacy ThemeTokens format
    const colors = normalizeToCoreColors(parsed);
    if (!colors) return null;

    return { identifier, title, description, colors, event };
  } catch {
    return null;
  }
}

/** Create tags for a kind 33891 theme definition event. */
export function buildThemeDefinitionTags(
  identifier: string,
  title: string,
  description?: string,
): string[][] {
  const tags: string[][] = [
    ['d', identifier],
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

// ─── Active Profile Theme (Kind 11667) ────────────────────────────────

export interface ActiveProfileTheme {
  /** The 4 core theme colors */
  colors: CoreThemeColors;
  /** naddr-style reference to the source theme definition, if any */
  sourceRef?: string;
  /** The original Nostr event */
  event: NostrEvent;
}

/** Parse and validate a kind 11667 active profile theme event. Returns null if invalid. */
export function parseActiveProfileTheme(event: NostrEvent): ActiveProfileTheme | null {
  if (event.kind !== ACTIVE_THEME_KIND) return null;

  try {
    const parsed = JSON.parse(event.content);

    // Accept both new CoreThemeColors format and legacy ThemeTokens format
    const colors = normalizeToCoreColors(parsed);
    if (!colors) return null;

    const sourceRef = event.tags.find(([n]) => n === 'a')?.[1];

    return { colors, sourceRef, event };
  } catch {
    return null;
  }
}

/** Create tags for a kind 11667 active profile theme event. */
export function buildActiveThemeTags(
  sourceAuthor?: string,
  sourceIdentifier?: string,
): string[][] {
  const tags: string[][] = [
    ['alt', 'Active profile theme'],
  ];
  if (sourceAuthor && sourceIdentifier) {
    tags.push(['a', `${THEME_DEFINITION_KIND}:${sourceAuthor}:${sourceIdentifier}`]);
  }
  return tags;
}

// ─── Backward Compatibility ───────────────────────────────────────────

/**
 * Normalize a parsed JSON object to CoreThemeColors.
 * Handles both the new format (background, text, primary, secondary)
 * and the legacy format (background, foreground, primary, accent).
 */
function normalizeToCoreColors(parsed: Record<string, unknown>): CoreThemeColors | null {
  // New format: CoreThemeColors
  if (parsed.background && parsed.text && parsed.primary && parsed.secondary) {
    return {
      background: String(parsed.background),
      text: String(parsed.text),
      primary: String(parsed.primary),
      secondary: String(parsed.secondary),
    };
  }

  // Legacy format: ThemeTokens (background, foreground, primary, accent)
  if (parsed.background && parsed.foreground && parsed.primary && parsed.accent) {
    return {
      background: String(parsed.background),
      text: String(parsed.foreground),
      primary: String(parsed.primary),
      secondary: String(parsed.accent),
    };
  }

  return null;
}
