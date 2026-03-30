import type { NostrEvent } from '@nostrify/nostrify';

export const LETTER_KIND = 8211;
export const COLOR_MOMENT_KIND = 3367;
export const THEME_KIND = 36767;

/** Default stationery background color (parchment). */
export const DEFAULT_STATIONERY_COLOR = '#F5E6D3';

/** Ratio of ruled-line height to card width. Used across letter rendering components. */
export const LINE_HEIGHT_RATIO = 0.084;

/** A sticker placed on top of the letter card */
export interface LetterSticker {
  /** Image URL of the sticker (empty string for drawn stickers) */
  url: string;
  /** NIP-30 shortcode (without colons). "drawing" for hand-drawn SVG stickers. */
  shortcode: string;
  /** X position as percentage (0–100) from left edge of the card */
  x: number;
  /** Y position as percentage (0–100) from top edge of the card */
  y: number;
  /** Rotation in degrees (-180 to 180) */
  rotation: number;
  /** Scale multiplier (default 1). Range 0.5–4. */
  scale?: number;
  /** Raw SVG markup for hand-drawn stickers. When present, rendered inline instead of url. */
  svg?: string;
}

export interface LetterContent {
  /** Main letter text. Optional — a letter must have either a non-empty body or at least one sticker. */
  body?: string;
  closing?: string;
  signature?: string;
  /** Stickers placed on the letter card — stored in encrypted content for privacy */
  stickers?: LetterSticker[];
  /** Visual stationery — all rendering attributes plus optional source event */
  stationery?: Stationery;
}

/**
 * Visual stationery for a letter — the wire format.
 *
 * User-chosen fields live directly on this object. Event-derived fields
 * (colors, layout, imageUrl, textColor, etc.) are read from the source
 * `event` at render time via `resolveStationery()`. Old letters that
 * predate this change may carry those fields as flat fallbacks.
 */
export interface Stationery {
  /** Background color (hex). Always present. */
  color: string;
  /** Emoji character for backsplash or emblem. */
  emoji?: string;
  /** Emoji display mode: 'tile' (faint repeating pattern) or 'emblem' (single large centered glyph). */
  emojiMode?: 'tile' | 'emblem';

  /** CSS font-family string (e.g. "Caveat, cursive"). Set from the sender's font choice. */
  fontFamily?: string;
  /** Frame style ID. */
  frame?: FrameStyle;
  /** When true, color-shift the frame emojis to match the stationery palette. */
  frameTint?: boolean;
  /** Source Nostr event (kind 36767 theme or kind 3367 color moment). */
  event?: NostrEvent;

  // --- Legacy flat fallbacks (from old letters, not set by new code) ---
  /** @deprecated Read from event tags instead. */
  textColor?: string;
  /** @deprecated Read from event tags instead. */
  primaryColor?: string;
  /** @deprecated Read from event tags instead. */
  layout?: string;
  /** @deprecated Read from event tags instead. */
  imageUrl?: string;
  /** @deprecated Read from event tags instead. */
  imageMode?: 'cover' | 'tile';
}

/** All rendering attributes for a stationery, fully resolved from event + fallbacks. */
export interface ResolvedStationery {
  color: string;
  textColor?: string;
  primaryColor?: string;
  emoji?: string;
  emojiMode: 'tile' | 'emblem';
  colors?: string[];
  layout?: string;
  imageUrl?: string;
  imageMode: 'cover' | 'tile';
  fontFamily?: string;
  frame?: FrameStyle;
  frameTint?: boolean;
  event?: NostrEvent;
}

/** Resolve a Stationery into full rendering attributes by reading event tags. */
export function resolveStationery(s: Stationery): ResolvedStationery {
  const base: ResolvedStationery = {
    color: s.color,
    emoji: s.emoji,
    emojiMode: s.emojiMode ?? 'tile',
    fontFamily: s.fontFamily,
    frame: s.frame,
    frameTint: s.frameTint,
    imageMode: 'cover',
    event: s.event,
  };

  const event = s.event;

  if (event?.kind === COLOR_MOMENT_KIND) {
    const hexRe = /^#[0-9A-Fa-f]{6}$/;
    const eventColors = event.tags.filter(([n]) => n === 'c').map(([, c]) => c).filter((c) => hexRe.test(c));
    if (eventColors.length >= 2) base.colors = eventColors;
    base.layout = s.layout ?? event.tags.find(([n]) => n === 'layout')?.[1];
    if (!base.emoji) {
      const raw = event.content?.trim();
      if (raw && [...raw].length <= 2 && /\p{Emoji}/u.test(raw)) base.emoji = raw;
    }
    return base;
  }

  if (event?.kind === THEME_KIND) {
    const colorTags = event.tags.filter(([n]) => n === 'c');
    for (const [, hex, marker] of colorTags) {
      if (marker === 'text') base.textColor = hex;
      if (marker === 'primary') base.primaryColor = hex;
    }

    const bgTag = event.tags.find(([n]) => n === 'bg');
    if (bgTag) {
      for (const slot of bgTag.slice(1)) {
        if (slot.startsWith('url ')) base.imageUrl = slot.slice(4);
        else if (slot === 'mode tile') base.imageMode = 'tile';
        else if (slot === 'mode cover') base.imageMode = 'cover';
      }
    }
    if (!base.imageUrl) {
      base.imageUrl = event.tags.find(([n]) => n === 'image')?.[1];
    }
    return base;
  }

  // No event or unknown kind — use legacy flat fallbacks (old letters, presets)
  base.textColor = s.textColor;
  base.primaryColor = s.primaryColor;
  base.layout = s.layout;
  base.imageUrl = s.imageUrl;
  base.imageMode = s.imageMode ?? 'cover';
  return base;
}

/**
 * Frame style presets — combinable with any stationery.
 * Each frame uses the same emoji-scatter system with different emoji sets
 * and default background colors.
 */
export type FrameStyle =
  | 'none'
  | 'flowers'
  | 'autumn'
  | 'ocean'
  | 'celestial'
  | 'hearts'
  | 'garden'
  | 'winter'
  | 'fruit'
  | 'sparkle';

export interface FramePreset {
  id: FrameStyle;
  name: string;
  /** Emoji set for the border scatter */
  emojis?: string[];
  /** Default background color (before tint) */
  bgColor?: string;
}

export const FRAME_PRESETS: FramePreset[] = [
  { id: 'none', name: 'None' },
  { id: 'flowers', name: 'Flowers', emojis: ['🌸', '🌺', '🌼', '🌷', '🌻', '🌹'], bgColor: '#3a7a3a' },
  { id: 'autumn', name: 'Autumn', emojis: ['🍂', '🍁', '🍃', '🌾', '🍄', '🌰'], bgColor: '#8b5e3c' },
  { id: 'ocean', name: 'Ocean', emojis: ['🐚', '🌊', '🐠', '🐙', '🦀', '🐬'], bgColor: '#1a5276' },
  { id: 'celestial', name: 'Celestial', emojis: ['🪐', '🌙', '⭐', '🌕', '☄️', '🔭'], bgColor: '#1a1a3e' },
  { id: 'hearts', name: 'Hearts', emojis: ['❤️', '💕', '💗', '💖', '💝', '💘'], bgColor: '#8b2252' },
  { id: 'garden', name: 'Garden', emojis: ['🦋', '🐝', '🌿', '🌱', '🐞', '🍀'], bgColor: '#2d5a27' },
  { id: 'winter', name: 'Winter', emojis: ['❄️', '⛄', '🌨️', '🏔️', '🎿', '🧣'], bgColor: '#4a6d8c' },
  { id: 'fruit', name: 'Fruit', emojis: ['🍊', '🍋', '🍓', '🍑', '🍒', '🫐'], bgColor: '#6b4226' },
  { id: 'sparkle', name: 'Sparkle', emojis: ['✨', '💎', '🔮', '🪩', '⚡', '🌈'], bgColor: '#4a2d6b' },
];

export interface Letter {
  event: NostrEvent;
  recipient: string;
  sender: string;
  decrypted: boolean;
  timestamp: number;
}

/**
 * Built-in stationery presets — flat single color + optional emoji backsplash.
 * No gradients.
 */
export const STATIONERY_PRESETS: Record<string, { name: string; color: string; emoji?: string }> = {
  parchment: { name: 'Parchment', color: DEFAULT_STATIONERY_COLOR, emoji: undefined },
  meadow:    { name: 'Meadow',    color: '#C8E6C9', emoji: '🌿' },
  twilight:  { name: 'Twilight',  color: '#E1BEE7', emoji: '🌙' },
  ocean:     { name: 'Ocean',     color: '#B3E5FC', emoji: '🌊' },
  blossom:   { name: 'Blossom',   color: '#FCE4EC', emoji: '🌸' },
  forest:    { name: 'Forest',    color: '#DCEDC8', emoji: '🌲' },
  butter:    { name: 'Butter',    color: '#FFF9C4', emoji: '🌻' },
  peach:     { name: 'Peach',     color: '#FFE0CC', emoji: '🍑' },
  mint:      { name: 'Mint',      color: '#E0F2E9', emoji: '🍃' },
  lavender:  { name: 'Lavender',  color: '#EDE7F6', emoji: '💜' },
};

export const CLOSING_PRESETS = [
  'With Love,',
  'Warmly,',
  'Yours Truly,',
  'XO,',
  'Until Next Time,',
  'Thinking of You,',
  'Forever Yours,',
  'With Gratitude,',
];

export const FONT_OPTIONS = [
  { value: 'fredoka',     label: 'Fredoka',     family: 'Fredoka Variable, Fredoka, sans-serif' },
  { value: 'nunito',      label: 'Nunito',      family: 'Nunito Variable, Nunito, sans-serif' },
  { value: 'playfair',   label: 'Playfair',   family: 'Playfair Display Variable, Playfair Display, serif' },
  { value: 'caveat',     label: 'Caveat',     family: 'Caveat, cursive' },
  { value: 'pacifico',   label: 'Pacifico',   family: 'Pacifico, cursive' },
  { value: 'pirata',     label: 'Pirata',     family: 'Pirata One, cursive' },
  { value: 'marker',     label: 'Marker',     family: 'Permanent Marker, cursive' },
  { value: 'typewriter', label: 'Typewriter', family: 'Special Elite, cursive' },
  { value: 'creepster',  label: 'Creepster',  family: 'Creepster, cursive' },
  { value: 'pixel',      label: 'Pixel',      family: 'Silkscreen, monospace' },
  { value: 'mono',       label: 'Mono',       family: 'ui-monospace, monospace' },
];

/**
 * Serializable stationery for localStorage persistence.
 * NostrEvent is a plain JSON object, so it serializes fine.
 */
export type SerializableStationery = Stationery;

/**
 * User's default letter preferences — persisted per-pubkey in settings.
 */
export interface LetterPreferences {
  /** Font value key from FONT_OPTIONS (e.g. 'caveat') */
  font?: string;
  /** Default stationery (without raw event) */
  stationery?: SerializableStationery;
  /** Default frame style */
  frame?: FrameStyle;
  /** Whether frame should match stationery color */
  frameTint?: boolean;
  /** Default closing line (e.g. 'Warmly,') */
  closing?: string;
  /** Default signature (e.g. 'Chad') */
  signature?: string;
  /** Only show letters from friends in the inbox */
  friendsOnlyInbox?: boolean;
  /** Only show friends in search suggestions */
  friendsOnlySearch?: boolean;
}

/** Build a Stationery from a preset key */
export function presetToStationery(key: string): Stationery | undefined {
  const preset = STATIONERY_PRESETS[key];
  if (!preset) return undefined;
  return { color: preset.color, emoji: preset.emoji };
}

/** Build a Stationery from a kind 3367 color moment event. */
export function colorMomentToStationery(event: NostrEvent): Stationery {
  const color = event.tags.find(([n]) => n === 'c')?.[1] ?? DEFAULT_STATIONERY_COLOR;
  return { color, event };
}

/** Build a Stationery from a kind 36767 theme event. */
export function themeToStationery(event: NostrEvent): Stationery {
  const bg = event.tags.filter(([n]) => n === 'c').find(([, , marker]) => marker === 'background');
  return { color: bg?.[1] ?? DEFAULT_STATIONERY_COLOR, event };
}
