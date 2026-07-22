/**
 * PlayStation 1 memory-card decoding for kind 38192 block events.
 *
 * A card is 16 × 8192-byte blocks. Block 0 is the header/directory; blocks
 * 1–15 hold saves. Each block is published as an addressable event whose
 * `content` is the block's 8192 bytes as 16384 lowercase hex characters.
 *
 * This module is framework-agnostic: it turns raw block bytes into a decoded
 * title and animated 16×16 icon frames (as `ImageData`), plus small helpers
 * for reading the kind-38192 tags off an event. Rendering lives in the UI layer.
 *
 * See the "Kind 38192" section of NIP.md for the full spec.
 */

import type { NostrEvent } from '@nostrify/nostrify';

/** Size of a single PS1 memory-card block, in bytes. */
export const BLOCK_SIZE = 8192;
/** Number of blocks on a card (block 0 = header, 1–15 = saves). */
export const BLOCK_COUNT = 16;
/** Kind number for memory-card block events. */
export const MEMORY_CARD_KIND = 38192;

/** Decode a lowercase hex string into bytes. Ignores nothing — caller validates length. */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  const len = clean.length >> 1;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

/** Encode bytes as a lowercase hex string. */
export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

/**
 * Fold full-width Latin characters (U+FF01–U+FF5E) and the ideographic space
 * (U+3000) down to their half-width ASCII equivalents. Many PS1 games render
 * English titles in full-width kana-width Latin (e.g. "ＳＰＹＲＯ"); this makes
 * them readable ("SPYRO") while leaving genuine kana/kanji untouched.
 */
export function foldFullwidth(s: string): string {
  let o = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0x3000) o += ' ';
    else if (c >= 0xff01 && c <= 0xff5e) o += String.fromCharCode(c - 0xfee0);
    else o += ch;
  }
  return o;
}

// A single Shift-JIS decoder, reused across calls. `undefined` if the runtime
// lacks the encoding (we then fall back to ASCII-only decoding).
const sjisDecoder: TextDecoder | undefined = (() => {
  try {
    return new TextDecoder('shift_jis');
  } catch {
    return undefined;
  }
})();

/**
 * Decode the BIOS save title from a save block's SC header. The title lives at
 * offset 0x04 for 64 bytes, Shift-JIS encoded and NUL/space terminated.
 */
export function decodeTitle(bytes: Uint8Array): string {
  const raw = bytes.slice(0x04, 0x04 + 64);
  let t: string | null = null;
  if (sjisDecoder) {
    try {
      t = sjisDecoder.decode(raw);
    } catch {
      t = null;
    }
  }
  if (t == null) {
    t = '';
    for (const c of raw) {
      if (c === 0) break;
      if (c >= 0x20 && c < 0x7f) t += String.fromCharCode(c);
    }
  }
  // Shift-JIS decode of trailing NULs yields spaces; cut at the first one.
  const nul = t.indexOf('\0');
  if (nul >= 0) t = t.slice(0, nul);
  return foldFullwidth(t).replace(/\s+$/, '').trim();
}

/** A decoded save block: its BIOS title and one or more animated icon frames. */
export interface BlockVisual {
  title: string;
  /** 16×16 icon frames (1–3), ready to paint onto a canvas. */
  frames: ImageData[];
}

/**
 * Decode a save block's title and 16×16 animated icon. Returns `null` if the
 * block is not a save (no "SC" magic) — e.g. block 0, free blocks, or
 * continuation blocks.
 *
 * The palette is 16 BGR555 colours at offset 0x60; icon frames are 4bpp
 * (16×16 = 256 pixels = 128 bytes) starting at 0x80, up to 3 frames.
 */
export function decodeBlockVisual(bytes: Uint8Array): BlockVisual | null {
  if (!(bytes[0] === 0x53 && bytes[1] === 0x43)) return null; // 'S' 'C'

  let nf = bytes[2] & 0x0f;
  if (nf < 1 || nf > 3) nf = 1;

  const pal: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 16; i++) {
    const v = bytes[0x60 + i * 2] | (bytes[0x60 + i * 2 + 1] << 8);
    const r = (v & 0x1f) * 8 | ((v & 0x1f) >> 2);
    const g = ((v >> 5) & 0x1f) * 8 | (((v >> 5) & 0x1f) >> 2);
    const b = ((v >> 10) & 0x1f) * 8 | (((v >> 10) & 0x1f) >> 2);
    pal.push([r, g, b, v === 0 ? 0 : 255]);
  }

  const frames: ImageData[] = [];
  for (let f = 0; f < nf; f++) {
    const base = 0x80 + f * 128;
    const img = new ImageData(16, 16);
    for (let idx = 0; idx < 256; idx++) {
      const byte = bytes[base + (idx >> 1)];
      const ci = (idx & 1) ? (byte >> 4) : (byte & 0x0f);
      const c = pal[ci];
      const o = idx * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
      img.data[o + 3] = c[3];
    }
    frames.push(img);
  }

  return { title: decodeTitle(bytes), frames };
}

/**
 * Best-effort region flag emoji from a `region` tag and/or save `filename`
 * (product code). Returns '' when the region can't be determined.
 */
export function regionFlag(region?: string | null, filename?: string | null): string {
  const s = ((region || '') + ' ' + (filename || '')).toUpperCase();
  if (/SCUS|SLUS|SLED|SCED/.test(s) || /\bNTSC-U|\bUS(A)?\b/.test(s)) return '🇺🇸';
  if (/SCES|SLES|SCED|\bEU|\bPAL\b/.test(s)) return '🇪🇺';
  if (/SCPS|SLPS|SLKA|SCAJ|SIPS|\bJP|NTSC-J/.test(s)) return '🇯🇵';
  return '';
}

/** First value of the given single-letter/named tag on an event, or `null`. */
export function tagVal(ev: NostrEvent, k: string): string | null {
  const t = ev.tags.find((t) => t[0] === k);
  return t ? t[1] : null;
}

/**
 * Block index (0–15) an event addresses. Reads the `block` tag, falling back to
 * the numeric suffix of the `d` tag (`<card-id>-<block>`). Returns -1 if absent.
 */
export function blockOf(ev: NostrEvent): number {
  const b = tagVal(ev, 'block');
  if (b != null) {
    const n = parseInt(b, 10);
    if (!Number.isNaN(n)) return n;
  }
  const d = tagVal(ev, 'd');
  if (d) {
    const m = d.match(/-(\d+)$/);
    if (m) return +m[1];
  }
  return -1;
}

/** The card id an event belongs to (its `m` tag), or `null`. */
export function cardIdOf(ev: NostrEvent): string | null {
  return tagVal(ev, 'm');
}

/**
 * Collapse a list of block events into the newest event per block index
 * (0–15), applying the relay's last-writer-wins rule for addressable events.
 */
export function latestBlocks(events: NostrEvent[]): Record<number, NostrEvent> {
  const blocks: Record<number, NostrEvent> = {};
  for (const ev of events) {
    const n = blockOf(ev);
    if (n < 0 || n > 15) continue;
    if (!blocks[n] || ev.created_at > blocks[n].created_at) blocks[n] = ev;
  }
  return blocks;
}

/** Decode an event's `content` to its 8192 raw bytes, or `null` if malformed. */
export function blockBytes(event: NostrEvent): Uint8Array | null {
  try {
    const b = hexToBytes(event.content);
    return b.length === BLOCK_SIZE ? b : null;
  } catch {
    return null;
  }
}

/**
 * Reconstruct the 131072-byte card image from a block map, zero-filling any
 * unpublished blocks. Returns the image plus how many blocks were present and
 * whether block 0 (the header/directory) was among them.
 */
export function reconstructCard(blocks: Record<number, NostrEvent>): {
  image: Uint8Array;
  present: number;
  hasHeader: boolean;
} {
  const image = new Uint8Array(BLOCK_SIZE * BLOCK_COUNT);
  let present = 0;
  for (let n = 0; n < BLOCK_COUNT; n++) {
    const ev = blocks[n];
    if (!ev) continue;
    const bytes = blockBytes(ev);
    if (bytes) {
      image.set(bytes, n * BLOCK_SIZE);
      present++;
    }
  }
  return { image, present, hasHeader: !!blocks[0] };
}

/**
 * Build the tag set for re-publishing a block under a new card id and/or block
 * index. The `content` bytes (and thus the `x` integrity tag) are unchanged;
 * only the address tags (`d`, `m`, `block`) are rewritten. The `client` tag is
 * dropped so {@link import('@/hooks/useNostrPublish').useNostrPublish} can add
 * its own.
 */
export function reTagBlock(
  source: NostrEvent,
  targetCardId: string,
  targetBlock: number,
): string[][] {
  const tags = source.tags
    .map((t) => t.slice())
    .filter((t) => t[0] !== 'd' && t[0] !== 'm' && t[0] !== 'block' && t[0] !== 'client');
  tags.unshift(['block', String(targetBlock)]);
  tags.unshift(['m', targetCardId]);
  tags.unshift(['d', `${targetCardId}-${targetBlock}`]);
  return tags;
}

/**
 * Validate a user-entered card id against the kind-38192 rules (no spaces, and it
 * must not end with `-<digits>`, which is the block-index suffix of the `d`
 * tag). Returns an error message, or `null` if valid.
 */
export function validateCardId(v: string): string | null {
  if (!v) return 'Enter a card id.';
  if (/\s/.test(v)) return 'Card id must not contain spaces.';
  if (/-\d+$/.test(v)) return 'Card id must not end with -<number> (that is the block suffix).';
  return null;
}

/** Directory-entry allocation state of a save block. */
export type BlockState = 'header' | 'first' | 'middle' | 'last' | 'free';

/** A card grouped from a relay scan: which author, id, and how many blocks. */
export interface CardSummary {
  pubkey: string;
  cardId: string;
  /** Distinct block indices seen for this card. */
  blocks: Set<number>;
  /** Human display name from a `name` tag, if any. */
  name: string | null;
  /** An event whose content decodes to an icon, for the gallery thumbnail. */
  iconEvent: NostrEvent | null;
  /** Newest event per save-slot index (1–15), for slot-grid previews. */
  slots: Record<number, NostrEvent>;
}

/**
 * Group a flat list of kind-38192 events into cards keyed by author + card id,
 * picking a representative icon event for each. Sorted by block count desc.
 */
export function groupCards(events: NostrEvent[]): CardSummary[] {
  const cards = new Map<string, CardSummary>();
  for (const ev of events) {
    const m = cardIdOf(ev) || '?';
    const key = ev.pubkey + '|' + m;
    let c = cards.get(key);
    if (!c) {
      c = { pubkey: ev.pubkey, cardId: m, blocks: new Set(), name: null, iconEvent: null, slots: {} };
      cards.set(key, c);
    }
    const n = blockOf(ev);
    if (n >= 0) c.blocks.add(n);
    if (n >= 1 && n <= 15 && (!c.slots[n] || ev.created_at > c.slots[n].created_at)) {
      c.slots[n] = ev;
    }
    c.name = c.name || tagVal(ev, 'name');
    if (!c.iconEvent) {
      const st = tagVal(ev, 'state');
      if ((st === 'first' || n >= 1) && ev.content && ev.content.length >= 200) {
        try {
          if (decodeBlockVisual(hexToBytes(ev.content.slice(0, BLOCK_SIZE * 2)))) {
            c.iconEvent = ev;
          }
        } catch {
          // ignore malformed content
        }
      }
    }
  }
  return [...cards.values()].sort((a, b) => b.blocks.size - a.blocks.size);
}
