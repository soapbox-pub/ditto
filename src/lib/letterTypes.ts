import type { NostrEvent } from '@nostrify/nostrify';
import { defineMessage, defineMessages, type IntlShape, type MessageDescriptor } from 'react-intl';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { sanitizeCssString } from '@/lib/fontLoader';
import { sanitizeEmoji } from '@/lib/sanitizeEmoji';

export const LETTER_KIND = 8211;
export const COLOR_MOMENT_KIND = 3367;
export const THEME_KIND = 36767;

/** Default stationery background color (parchment). */
export const DEFAULT_STATIONERY_COLOR = '#F5E6D3';

/** Inboxes show only friends' letters until the user turns it off, so strangers can't land in them. */
export const DEFAULT_FRIENDS_ONLY_INBOX = true;

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
  /** Native unicode emoji for emoji stickers (shortcode "emoji", url ""). Rendered as text. */
  emoji?: string;
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
  /** Wax seal stamped on the envelope. Untrusted on receive — read through parseSeal(). */
  seal?: WaxSeal;
}

// ---------------------------------------------------------------------------
// Wax seal
// ---------------------------------------------------------------------------

/** Built-in stamp designs. Paths live in WaxSeal.tsx. */
export type SealIcon =
  | 'leaf' | 'heart' | 'star' | 'moon' | 'flower' | 'crown' | 'sun' | 'ditto'
  // Unlocked by using other Nostr apps
  | 'treasures' | 'espy' | 'surveil' | 'nostrdamus';

/** Earned by having published any of `kinds` — i.e. by having used `app`. */
export interface SealUnlock {
  app: string;
  url: string;
  kinds: number[];
  /** What to do to earn it, e.g. "hide or find a treasure" */
  hint: MessageDescriptor;
}

export const SEAL_ICONS: { id: SealIcon; name: MessageDescriptor; unlock?: SealUnlock }[] = [
  { id: 'ditto', name: defineMessage({ id: 'letterSeal.icon.ditto', defaultMessage: 'Ditto' }) },
  { id: 'leaf', name: defineMessage({ id: 'letterSeal.icon.leaf', defaultMessage: 'Leaf' }) },
  { id: 'heart', name: defineMessage({ id: 'letterSeal.icon.heart', defaultMessage: 'Heart' }) },
  { id: 'star', name: defineMessage({ id: 'letterSeal.icon.star', defaultMessage: 'Star' }) },
  { id: 'moon', name: defineMessage({ id: 'letterSeal.icon.moon', defaultMessage: 'Moon' }) },
  { id: 'flower', name: defineMessage({ id: 'letterSeal.icon.flower', defaultMessage: 'Flower' }) },
  { id: 'crown', name: defineMessage({ id: 'letterSeal.icon.crown', defaultMessage: 'Crown' }) },
  { id: 'sun', name: defineMessage({ id: 'letterSeal.icon.sun', defaultMessage: 'Sun' }) },
  // Geocache listing, found log, verified find (NIP-GC)
  { id: 'treasures', name: defineMessage({ id: 'letterSeal.icon.treasures', defaultMessage: 'Treasures' }), unlock: { app: 'Treasures', url: 'https://treasures.to', kinds: [37516, 7516, 7517], hint: defineMessage({ id: 'letterSeal.unlock.treasures', defaultMessage: 'hide or find a treasure' }) } },
  // Color moment
  { id: 'espy', name: defineMessage({ id: 'letterSeal.icon.espy', defaultMessage: 'Espy' }), unlock: { app: 'Espy', url: 'https://espy.you', kinds: [COLOR_MOMENT_KIND], hint: defineMessage({ id: 'letterSeal.unlock.espy', defaultMessage: 'capture a color moment' }) } },
  // Magic deck
  { id: 'surveil', name: defineMessage({ id: 'letterSeal.icon.surveil', defaultMessage: 'Surveil' }), unlock: { app: 'Surveil', url: 'https://surveil.cards', kinds: [37381], hint: defineMessage({ id: 'letterSeal.unlock.surveil', defaultMessage: 'build a deck' }) } },
  // Tarot reading (NIP-TR)
  { id: 'nostrdamus', name: defineMessage({ id: 'letterSeal.icon.nostrdamus', defaultMessage: 'Nostrdamus' }), unlock: { app: 'Nostrdamus', url: 'https://nostrdamus.me', kinds: [2256], hint: defineMessage({ id: 'letterSeal.unlock.nostrdamus', defaultMessage: 'draw a tarot reading' }) } },
];

export const WAX_COLORS: { name: MessageDescriptor; color: string }[] = [
  { name: defineMessage({ id: 'letterSeal.wax.violet', defaultMessage: 'Violet' }), color: '#7C52E0' },
  { name: defineMessage({ id: 'letterSeal.wax.forest', defaultMessage: 'Forest' }), color: '#438060' },
  { name: defineMessage({ id: 'letterSeal.wax.crimson', defaultMessage: 'Crimson' }), color: '#9B1B30' },
  { name: defineMessage({ id: 'letterSeal.wax.burgundy', defaultMessage: 'Burgundy' }), color: '#6D1A2A' },
  { name: defineMessage({ id: 'letterSeal.wax.blush', defaultMessage: 'Blush' }), color: '#C9677D' },
  { name: defineMessage({ id: 'letterSeal.wax.copper', defaultMessage: 'Copper' }), color: '#A0522D' },
  { name: defineMessage({ id: 'letterSeal.wax.gold', defaultMessage: 'Gold' }), color: '#B8892B' },
  { name: defineMessage({ id: 'letterSeal.wax.teal', defaultMessage: 'Teal' }), color: '#2A7F8F' },
  { name: defineMessage({ id: 'letterSeal.wax.navy', defaultMessage: 'Navy' }), color: '#1F3A68' },
  { name: defineMessage({ id: 'letterSeal.wax.plum', defaultMessage: 'Plum' }), color: '#5E2A5E' },
  { name: defineMessage({ id: 'letterSeal.wax.ink', defaultMessage: 'Ink' }), color: '#2A2626' },
];

/** The emblem pressed into the wax: a built-in icon, a native emoji, or 1–3 initials. */
export type SealEmblem =
  | { type: 'icon'; value: SealIcon }
  | { type: 'emoji'; value: string }
  | { type: 'initials'; value: string };

export interface WaxSeal {
  /** Wax color (hex). */
  color: string;
  emblem: SealEmblem;
}

export const SEAL_INITIALS_MAX = 3;

/** Wax color of the default seal when the stationery has no usable primary color. */
const DEFAULT_WAX_COLOR = '#7C52E0';

/** The seal a letter gets when none was chosen: the Ditto logo, in the stationery's primary color. */
export function defaultSeal(primaryColor?: string): WaxSeal {
  return { color: isHexColor(primaryColor) ? primaryColor : DEFAULT_WAX_COLOR, emblem: { type: 'icon', value: 'ditto' } };
}

/** Validate an untrusted seal (from a decrypted letter or synced prefs). */
export function parseSeal(raw: unknown): WaxSeal | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const { color, emblem } = raw as { color?: unknown; emblem?: { type?: unknown; value?: unknown } };
  if (!isHexColor(color)) return undefined;
  if (!emblem || typeof emblem !== 'object' || typeof emblem.value !== 'string') return undefined;
  const value = emblem.value;
  switch (emblem.type) {
    case 'icon':
      return SEAL_ICONS.some((i) => i.id === value) ? { color, emblem: { type: 'icon', value: value as SealIcon } } : undefined;
    case 'emoji': {
      const emoji = sanitizeEmoji(value);
      return emoji ? { color, emblem: { type: 'emoji', value: emoji } } : undefined;
    }
    case 'initials': {
      const initials = [...value.trim()].slice(0, SEAL_INITIALS_MAX).join('');
      return initials ? { color, emblem: { type: 'initials', value: initials } } : undefined;
    }
    default:
      return undefined;
  }
}

export function sealsEqual(a: WaxSeal, b: WaxSeal): boolean {
  return a.color.toLowerCase() === b.color.toLowerCase()
    && a.emblem.type === b.emblem.type
    && a.emblem.value === b.emblem.value;
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
  /** @deprecated Read from event tags instead. */
  colors?: string[];
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
  // Sanitize event-sourced font family before CSS interpolation (see SECURITY_AUDIT M-6).
  // Applied at the parse layer so every consumer gets a safe value.
  const safeFontFamily = s.fontFamily ? sanitizeCssString(s.fontFamily) : undefined;

  const base: ResolvedStationery = {
    color: s.color,
    emoji: s.emoji,
    emojiMode: s.emojiMode ?? 'tile',
    fontFamily: safeFontFamily,
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
      if (!isHexColor(hex)) continue;
      if (marker === 'text') base.textColor = hex;
      if (marker === 'primary') base.primaryColor = hex;
    }

    const bgTag = event.tags.find(([n]) => n === 'bg');
    if (bgTag) {
      for (const slot of bgTag.slice(1)) {
        // Sanitize event-sourced URL before CSS `url(...)` interpolation (H-2).
        if (slot.startsWith('url ')) base.imageUrl = sanitizeUrl(slot.slice(4));
        else if (slot === 'mode tile') base.imageMode = 'tile';
        else if (slot === 'mode cover') base.imageMode = 'cover';
      }
    }
    if (!base.imageUrl) {
      base.imageUrl = sanitizeUrl(event.tags.find(([n]) => n === 'image')?.[1]);
    }
    return base;
  }

  // No event or unknown kind — use legacy flat fallbacks (old letters, presets).
  // Legacy `imageUrl` may carry user-supplied URLs from pre-sanitization letters,
  // so sanitize here as well for defense-in-depth.
  base.textColor = s.textColor;
  base.primaryColor = s.primaryColor;
  base.layout = s.layout;
  base.imageUrl = sanitizeUrl(s.imageUrl);
  base.imageMode = s.imageMode ?? 'cover';
  base.colors = s.colors;
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
  | 'halloween';

export interface FramePreset {
  id: FrameStyle;
  name: MessageDescriptor;
  /** Emoji set for the border scatter */
  emojis?: string[];
  /** Default background color (before tint) */
  bgColor?: string;
}

export const FRAME_PRESETS: FramePreset[] = [
  { id: 'none', name: defineMessage({ id: 'letterFrame.none', defaultMessage: 'None' }) },
  { id: 'flowers', name: defineMessage({ id: 'letterFrame.flowers', defaultMessage: 'Flowers' }), emojis: ['🌸', '🌺', '🌼', '🌷', '🌻', '🌹'], bgColor: '#3a7a3a' },
  { id: 'autumn', name: defineMessage({ id: 'letterFrame.autumn', defaultMessage: 'Autumn' }), emojis: ['🍂', '🍁', '🍃', '🌾', '🍄', '🌰'], bgColor: '#8b5e3c' },
  { id: 'ocean', name: defineMessage({ id: 'letterFrame.ocean', defaultMessage: 'Ocean' }), emojis: ['🐚', '🌊', '🐠', '🐙', '🦀', '🐬'], bgColor: '#1a5276' },
  { id: 'celestial', name: defineMessage({ id: 'letterFrame.celestial', defaultMessage: 'Celestial' }), emojis: ['🪐', '🌙', '⭐', '🌕', '☄️', '✨'], bgColor: '#1a1a3e' },
  { id: 'hearts', name: defineMessage({ id: 'letterFrame.hearts', defaultMessage: 'Hearts' }), emojis: ['❤️', '💕', '💗', '💖', '💝', '💘'], bgColor: '#8b2252' },
  { id: 'garden', name: defineMessage({ id: 'letterFrame.garden', defaultMessage: 'Garden' }), emojis: ['🦋', '🐝', '🌿', '🌱', '🐞', '🍀'], bgColor: '#2d5a27' },
  { id: 'winter', name: defineMessage({ id: 'letterFrame.winter', defaultMessage: 'Winter' }), emojis: ['🎄', '🎁', '⛄', '❄️', '🔔', '🎅'], bgColor: '#4a6d8c' },
  { id: 'fruit', name: defineMessage({ id: 'letterFrame.fruit', defaultMessage: 'Fruit' }), emojis: ['🍊', '🍋', '🍓', '🍑', '🍒', '🫐'], bgColor: '#6b4226' },
  { id: 'halloween', name: defineMessage({ id: 'letterFrame.halloween', defaultMessage: 'Halloween' }), emojis: ['🎃', '👻', '🦇', '🕸️', '💀', '🕯️'], bgColor: '#4a2a5a' },
];

/** A known frame ID, or 'none' (for saved choices of frames since retired). */
export function frameOrNone(id: unknown): FrameStyle {
  return FRAME_PRESETS.find((f) => f.id === id)?.id ?? 'none';
}

// ---------------------------------------------------------------------------
// Validation of decrypted letters (anyone can send one)
// ---------------------------------------------------------------------------

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const MAX_STICKERS = 100;
const MAX_TEXT = 20_000;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR.test(value);
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max = MAX_TEXT) => (typeof v === 'string' ? v.slice(0, max) : undefined);
const num = (v: unknown, min: number, max: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

function parseSourceEvent(raw: unknown): NostrEvent | undefined {
  if (!isObject(raw)) return undefined;
  const { id, pubkey, sig, kind, created_at, content, tags } = raw;
  if (typeof kind !== 'number' || typeof content !== 'string' || !Array.isArray(tags)) return undefined;
  if (!tags.every((t) => Array.isArray(t) && t.every((v) => typeof v === 'string'))) return undefined;
  return {
    id: typeof id === 'string' ? id : '',
    pubkey: typeof pubkey === 'string' ? pubkey : '',
    sig: typeof sig === 'string' ? sig : '',
    created_at: typeof created_at === 'number' ? created_at : 0,
    kind,
    content,
    tags: tags as string[][],
  };
}

function parseStationery(raw: unknown): Stationery | undefined {
  if (!isObject(raw) || !isHexColor(raw.color)) return undefined;
  const emoji = typeof raw.emoji === 'string' ? sanitizeEmoji(raw.emoji) : undefined;
  const fontFamily = str(raw.fontFamily, 200);
  const colors = Array.isArray(raw.colors) ? raw.colors.filter(isHexColor).slice(0, 12) : undefined;
  const event = parseSourceEvent(raw.event);
  const imageUrl = typeof raw.imageUrl === 'string' ? sanitizeUrl(raw.imageUrl) : undefined;
  return {
    color: raw.color,
    ...(emoji && { emoji }),
    ...((raw.emojiMode === 'tile' || raw.emojiMode === 'emblem') && { emojiMode: raw.emojiMode }),
    ...(fontFamily && !/[;{}<>]/.test(fontFamily) && { fontFamily }),
    ...(FRAME_PRESETS.some((f) => f.id === raw.frame) && { frame: raw.frame as FrameStyle }),
    ...(typeof raw.frameTint === 'boolean' && { frameTint: raw.frameTint }),
    ...(event && { event }),
    ...(isHexColor(raw.textColor) && { textColor: raw.textColor }),
    ...(isHexColor(raw.primaryColor) && { primaryColor: raw.primaryColor }),
    ...(typeof raw.layout === 'string' && { layout: raw.layout.slice(0, 50) }),
    ...(imageUrl && { imageUrl }),
    ...((raw.imageMode === 'cover' || raw.imageMode === 'tile') && { imageMode: raw.imageMode }),
    ...(colors && colors.length > 0 && { colors }),
  };
}

function parseSticker(raw: unknown): LetterSticker | undefined {
  if (!isObject(raw)) return undefined;
  const x = num(raw.x, 0, 100);
  const y = num(raw.y, 0, 100);
  if (x === undefined || y === undefined) return undefined;
  const svg = str(raw.svg, 256 * 1024);
  const emoji = typeof raw.emoji === 'string' ? sanitizeEmoji(raw.emoji) : undefined;
  const url = str(raw.url, 2000) ?? '';
  if (!svg && !emoji && !url) return undefined;
  const scale = num(raw.scale, 0.5, 4);
  return {
    url,
    shortcode: str(raw.shortcode, 100) ?? '',
    x,
    y,
    rotation: num(raw.rotation, -180, 180) ?? 0,
    ...(scale !== undefined && { scale }),
    ...(svg && { svg }),
    ...(emoji && { emoji }),
  };
}

/**
 * Validate a decrypted letter. Anyone can write to anyone, so every field is
 * untrusted: wrong types would crash rendering for the whole inbox. Returns
 * undefined unless the letter has a body or at least one sticker.
 */
export function parseLetterContent(raw: unknown): LetterContent | undefined {
  if (!isObject(raw)) return undefined;
  const body = str(raw.body);
  const stickers = Array.isArray(raw.stickers)
    ? raw.stickers.slice(0, MAX_STICKERS).map(parseSticker).filter((s): s is LetterSticker => !!s)
    : [];
  if (!body?.trim() && stickers.length === 0) return undefined;
  const stationery = parseStationery(raw.stationery);
  const seal = parseSeal(raw.seal);
  const closing = str(raw.closing, 200);
  const signature = str(raw.signature, 200);
  return {
    ...(body && { body }),
    ...(closing && { closing }),
    ...(signature && { signature }),
    ...(stickers.length > 0 && { stickers }),
    ...(stationery && { stationery }),
    ...(seal && { seal }),
  };
}

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
export const STATIONERY_PRESETS: Record<string, { name: MessageDescriptor; color: string; emoji?: string }> = {
  parchment: { name: defineMessage({ id: 'letterStationery.parchment', defaultMessage: 'Parchment' }), color: DEFAULT_STATIONERY_COLOR, emoji: undefined },
  meadow: { name: defineMessage({ id: 'letterStationery.meadow', defaultMessage: 'Meadow' }), color: '#C8E6C9', emoji: '🌿' },
  twilight: { name: defineMessage({ id: 'letterStationery.twilight', defaultMessage: 'Twilight' }), color: '#E1BEE7', emoji: '🌙' },
  ocean: { name: defineMessage({ id: 'letterStationery.ocean', defaultMessage: 'Ocean' }), color: '#B3E5FC', emoji: '🌊' },
  blossom: { name: defineMessage({ id: 'letterStationery.blossom', defaultMessage: 'Blossom' }), color: '#FCE4EC', emoji: '🌸' },
  forest: { name: defineMessage({ id: 'letterStationery.forest', defaultMessage: 'Forest' }), color: '#DCEDC8', emoji: '🌲' },
  butter: { name: defineMessage({ id: 'letterStationery.butter', defaultMessage: 'Butter' }), color: '#FFF9C4', emoji: '🌻' },
  peach: { name: defineMessage({ id: 'letterStationery.peach', defaultMessage: 'Peach' }), color: '#FFE0CC', emoji: '🍑' },
  mint: { name: defineMessage({ id: 'letterStationery.mint', defaultMessage: 'Mint' }), color: '#E0F2E9', emoji: '🍃' },
  lavender: { name: defineMessage({ id: 'letterStationery.lavender', defaultMessage: 'Lavender' }), color: '#EDE7F6', emoji: '💜' },
  // Seasonal
  spring: { name: defineMessage({ id: 'letterStationery.spring', defaultMessage: 'Spring' }), color: '#F0F4C3', emoji: '🐣' },
  birthday: { name: defineMessage({ id: 'letterStationery.birthday', defaultMessage: 'Birthday' }), color: '#FFF3D6', emoji: '🎂' },
  pumpkin: { name: defineMessage({ id: 'letterStationery.pumpkin', defaultMessage: 'Pumpkin' }), color: '#FFE0B2', emoji: '🎃' },
  snowfall: { name: defineMessage({ id: 'letterStationery.snowfall', defaultMessage: 'Snowfall' }), color: '#E3F2FD', emoji: '❄️' },
  holly: { name: defineMessage({ id: 'letterStationery.holly', defaultMessage: 'Holly' }), color: '#F9E0E0', emoji: '🎄' },
};

/**
 * Closing-line presets. The closing is written into the letter itself, so the
 * chosen preset is formatted in the sender's locale and stored as plain text.
 */
export const CLOSING_PRESETS: MessageDescriptor[] = Object.values(defineMessages({
  withLove: { id: 'letterClosing.withLove', defaultMessage: 'With Love,' },
  warmly: { id: 'composeLetter.defaultClosing', defaultMessage: 'Warmly,' },
  yoursTruly: { id: 'letterClosing.yoursTruly', defaultMessage: 'Yours Truly,' },
  xo: { id: 'letterClosing.xo', defaultMessage: 'XO,' },
  untilNextTime: { id: 'letterClosing.untilNextTime', defaultMessage: 'Until Next Time,' },
  thinkingOfYou: { id: 'letterClosing.thinkingOfYou', defaultMessage: 'Thinking of You,' },
  foreverYours: { id: 'letterClosing.foreverYours', defaultMessage: 'Forever Yours,' },
  withGratitude: { id: 'letterClosing.withGratitude', defaultMessage: 'With Gratitude,' },
}));

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

/** Translated labels for fonts with descriptive (non-brand) names. */
const FONT_LABELS: Record<string, MessageDescriptor> = defineMessages({
  marker: { id: 'letterFont.marker', defaultMessage: 'Marker' },
  typewriter: { id: 'letterFont.typewriter', defaultMessage: 'Typewriter' },
  pixel: { id: 'letterFont.pixel', defaultMessage: 'Pixel' },
  mono: { id: 'letterFont.mono', defaultMessage: 'Mono' },
});

/** Display label for a font option (font brand names are shown as-is). */
export function formatFontLabel(intl: IntlShape, font: { value: string; label: string }): string {
  const message = FONT_LABELS[font.value];
  return message ? intl.formatMessage(message) : font.label;
}

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
  /** Only show letters from friends in the inbox (default {@link DEFAULT_FRIENDS_ONLY_INBOX}) */
  friendsOnlyInbox?: boolean;
  /** Only show friends in search suggestions */
  friendsOnlySearch?: boolean;
  /** Default wax seal for new letters */
  seal?: WaxSeal;
}

/** Build a Stationery from a preset key */
export function presetToStationery(key: string): Stationery | undefined {
  const preset = STATIONERY_PRESETS[key];
  if (!preset) return undefined;
  return { color: preset.color, emoji: preset.emoji, ...(preset.emoji && { emojiMode: 'emblem' as const }) };
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
