import type { NostrEvent } from '@nostrify/nostrify';

import type { ThemeTokens } from '@/themes';
import { hexToHslString, hslStringToHex, deriveTokensFromCore } from '@/lib/colorUtils';

// ─── Yourspace (Kind 30203) Schema ────────────────────────────────────

/** The content JSON of a Yourspace kind 30203 event. */
export interface YourspaceThemeContent {
  preset?: string;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  borderRadius: string;
  fontFamily: string;
  fontSize: string;
  effects?: {
    particleEffect?: string;
    particleIntensity?: number;
    particleColor?: string;
    hoverAnimation?: string;
    entranceAnimation?: string;
    clickEffect?: string;
    cursorTrail?: string;
    cursorEmoji?: string;
  };
}

// ─── Validation ───────────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Validate and parse a kind 30203 event. Returns null if invalid. */
export function parseYourspaceEvent(event: NostrEvent): YourspaceThemeContent | null {
  if (event.kind !== 30203) return null;

  const dTag = event.tags.find(([n]) => n === 'd')?.[1];
  if (dTag !== 'profile-theme') return null;

  try {
    const content = JSON.parse(event.content) as YourspaceThemeContent;

    // Validate required hex color fields
    if (
      !HEX_COLOR.test(content.primaryColor) ||
      !HEX_COLOR.test(content.accentColor) ||
      !HEX_COLOR.test(content.backgroundColor) ||
      !HEX_COLOR.test(content.textColor)
    ) {
      return null;
    }

    return content;
  } catch {
    return null;
  }
}

// ─── Conversion: Yourspace → Our Tokens ───────────────────────────────

/**
 * Convert a Yourspace theme (hex colors) to our 28-token ThemeTokens format.
 * Uses deriveTokensFromCore to intelligently generate surface/UI tokens
 * based on whether the background is dark or light.
 */
export function yourspaceToTokens(ys: YourspaceThemeContent): ThemeTokens {
  const background = hexToHslString(ys.backgroundColor);
  const foreground = hexToHslString(ys.textColor);
  const primary = hexToHslString(ys.primaryColor);
  const accent = hexToHslString(ys.accentColor);

  return deriveTokensFromCore(background, foreground, primary, accent);
}

// ─── Conversion: Our Tokens → Yourspace ───────────────────────────────

/**
 * Convert our ThemeTokens to Yourspace format for publishing as kind 30203.
 * Maps core tokens to hex colors. Effects are set to defaults (none).
 */
export function tokensToYourspace(tokens: ThemeTokens): YourspaceThemeContent {
  return {
    preset: 'custom',
    primaryColor: hslStringToHex(tokens.primary),
    accentColor: hslStringToHex(tokens.accent),
    backgroundColor: hslStringToHex(tokens.background),
    textColor: hslStringToHex(tokens.foreground),
    borderRadius: '12',
    fontFamily: 'Inter',
    fontSize: '14',
    effects: {
      particleEffect: 'none',
      particleIntensity: 0,
      particleColor: hslStringToHex(tokens.primary),
      hoverAnimation: 'none',
      entranceAnimation: 'none',
      clickEffect: 'none',
      cursorTrail: 'none',
      cursorEmoji: '',
    },
  };
}
