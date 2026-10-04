import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

import { isNostrId } from '@/lib/nostrId';
import { parseAddr } from '@/lib/parseAddr';

/**
 * Simple Nostr Objects (Cyberspace DECK-0003): small 3D objects carried as
 * JSON in an event's content. A list of vertices on an integer lattice, one
 * color per vertex, optional triangles, and a word saying how to draw them.
 *
 * This module is the format itself — parsing, the §1.9 validation, palettes
 * and references — with no three.js, so it can sit in the eager bundle.
 *
 * https://github.com/arkin0x/cyberspace/blob/master/decks/DECK-0003-sno.md
 */

/** A standalone object (§3.1). Addressable. */
export const SNO_KIND = 33331;

/** sRGB, each channel 0..1. */
export type Rgb = [number, number, number];

export type SnoMode = 'solid' | 'points' | 'lines';

/** Sub-unit steps per model unit (§1.2). */
export const TICKS_PER_UNIT = 120;

/** How many levels of placed objects a reader follows (§1.10). */
export const SNO_MAX_DEPTH = 4;

/** Something an object places, named the way a tag names an event (§1.10). */
export type SnoRef =
  | { type: 'a'; pubkey: string; identifier: string }
  | { type: 'e'; id: string };

/** Where a placed object stands (§1.10). */
export interface SnoPart {
  /** Index into `refs`. */
  ref: number;
  /** Origin, in the parent's ticks. */
  offset: [number, number, number];
  /** Whole degrees about the parent's X, then Y, then Z. */
  rotation: [number, number, number];
  /** Power-of-two scale step. */
  step: number;
}

/** A palette published as its own event (§1.3b). */
export type SnoPaletteRef =
  | { type: 'nevent'; id: string }
  | { type: 'naddr'; kind: number; pubkey: string; identifier: string };

export interface SnoObject {
  version: 1 | 2;
  name: string;
  unit: number;
  mode: SnoMode;
  /** Vertex positions in ticks, flat `[x, y, z, …]`, in the v2 frame (Y up, +Z toward the viewer). */
  positions: number[];
  /** One color per vertex, resolved against the palette in hand. */
  colors: Rgb[];
  /** v2 palette indices per vertex, kept so a fetched palette can recolor them. */
  colorIndices?: number[];
  faces: [number, number, number][];
  /** One palette index per face, expanded from its run-length form. */
  faceColorIndices?: number[];
  /** The palette the indices name until any reference resolves. */
  palette: Rgb[];
  paletteRef?: SnoPaletteRef;
  refs: SnoRef[];
  parts: SnoPart[];
}

/** `cyberspace-neon-256`, the built-in palette (Appendix C). */
const BUILTIN_HEX =
  '003632004d49006562007e7d00979900b2b800cdd700e8f9003538004c5100636d007c8a0095a900afca00c9ed6fdfff' +
  '00343f004a5a0061780079980092ba00abdf34c4ff93d8ff003346004865005e860075ab008dd200a4fd6ebcffa7d3ff' +
  '00305200447600589e006ccc017fff5a9bff8bb5ffb5ceff00266d002cac1902ff374fff5a73ff7e92ffa1aeffc3c9ff' +
  '2200883700b75000e76837ff8064ff9b86ffb6a5ffd0c4ff3500794f00a36b00cd8b00f8a24bffb875ffcd9affe1bcff' +
  '4200695f008d7f00b1a200d5c600f8dd53ffed84fff9afff4b00586b00768e0094b200b1d900cdff1ae7ff7de2ffb1e6' +
  '52004674005f980077be008ee600a4ff45b4ff87c0ffb5d25700357a00489f005ac6006bee007bff538dff8ca6ffb7c2' +
  '5a00247e0031a3003dcb0047f4004eff5b6aff908effb9b45c0010800014a60013ce0006f22400ff613eff9375ffbba5' +
  '561200752200943300b44600d45a00f47000ff9652ffbd934b1f00683100854300a25700c06d00de8300fc9b00ffc077' +
  '4426005e3800794c00946100b07800cc8f00e7a800ffc3333e2a00563d006e5300876900a08100b99900d2b300ebce00' +
  '372d004d42006358007970008f8800a5a300b9be00cdda002f3000424600555e0067770077910087ad0094ca009fe800' +
  '243400314b003d6400457f00499b0045b9002cd90000f837073900005108006a1f008436009f4e00ba6700d68200f39e' +
  '00381e00503000684400825b009c7300b78d00d3a900efc600372a004e3f00665600806e009a8900b4a500d0c200ece1' +
  '010101020203050606090b0c0f121315191a1b2021222728282e302f3638373e403e4648454e504d5658555e605d6769' +
  '666f716e787a77808380898c899294939b9d9ca4a6a6adafb0b6b8babfc1c4c9caced2d3d8dcdce3e5e6eeefeff8f8f8' +
  '000000ffffff00e5ffff3b6bf7931a52e39fc8f5ff6f8ea01d354705070dff00ff00ff0000ffffffff00ff00000000ff' +
  '39ff14ff6ec77df9ffb026fffffb00ff330000ff9fff007f4d4dffffd3000a0f1a12182a1a0f240f1f1c2410161c1c0f';

function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const BUILTIN_PALETTE: Rgb[] = Array.from({ length: 256 }, (_, i) => hexToRgb(BUILTIN_HEX.slice(i * 6, i * 6 + 6)));

const BUILTIN_PALETTE_NAME = 'cyberspace-neon-256';

function isInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isIntIn(value: unknown, min: number, max: number): value is number {
  return isInt(value) && value >= min && value <= max;
}

/** An inline palette: 2..256 `[r, g, b]` triples of 0..255 integers. */
function parseInlinePalette(value: unknown[]): Rgb[] | undefined {
  if (value.length < 2 || value.length > 256) return undefined;
  const palette: Rgb[] = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 3 || !entry.every((c) => isIntIn(c, 0, 255))) return undefined;
    palette.push([entry[0] / 255, entry[1] / 255, entry[2] / 255]);
  }
  return palette;
}

function parsePaletteRef(value: string): SnoPaletteRef | undefined {
  try {
    const decoded = nip19.decode(value);
    if (decoded.type === 'nevent' && isNostrId(decoded.data.id)) {
      return { type: 'nevent', id: decoded.data.id };
    }
    if (decoded.type === 'naddr' && isNostrId(decoded.data.pubkey)) {
      return { type: 'naddr', kind: decoded.data.kind, pubkey: decoded.data.pubkey, identifier: decoded.data.identifier };
    }
  } catch {
    // Not bech32.
  }
  return undefined;
}

/**
 * Expand a run-length array where a negative `-N` stands for N of something:
 * `fill(N)` produces them. Returns `undefined` on a malformed entry.
 */
function expandRuns<T>(
  entries: unknown[],
  readEntry: (entry: unknown, out: T[]) => boolean,
  fill: (n: number, out: T[]) => boolean,
): T[] | undefined {
  const out: T[] = [];
  for (const entry of entries) {
    if (isInt(entry) && entry < 0) {
      if (!fill(-entry, out)) return undefined;
    } else if (!readEntry(entry, out)) {
      return undefined;
    }
  }
  return out;
}

/** Thrown with the §1.9 rule a payload broke. */
export class SnoError extends Error {}

function fail(reason: string): never {
  throw new SnoError(reason);
}

/**
 * Parse and validate an SNO payload (§1.9). Throws {@link SnoError} on any
 * failure: a partially valid object is not rendered partially.
 */
export function parseSno(content: string): SnoObject {
  let json: unknown;
  try {
    json = JSON.parse(content);
  } catch {
    fail('not JSON');
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) fail('not an object');
  const p = json as Record<string, unknown>;

  // 1
  if (p.v !== 1 && p.v !== 2) fail('unsupported version');
  const version = p.v;

  if (typeof p.name !== 'string') fail('missing name');
  const name = [...p.name].slice(0, 64).join('');

  // 2
  if (!Array.isArray(p.vertices) || !Array.isArray(p.colors) || !Array.isArray(p.faces)) fail('missing arrays');
  const vertexCount = p.vertices.length;
  if (p.colors.length !== vertexCount) fail('colors and vertices differ in length');

  // 4
  if (p.mode !== 'solid' && p.mode !== 'points' && p.mode !== 'lines') fail('unknown mode');
  const mode = p.mode;

  // 5
  if (!isIntIn(p.unit, 0, 84)) fail('unit out of range');
  const unit = p.unit;

  // 7
  let ticks: number[][] | undefined;
  if (p.ticks !== undefined) {
    if (!Array.isArray(p.ticks)) fail('malformed ticks');
    ticks = expandRuns<number[]>(
      p.ticks,
      (entry, out) => {
        if (!Array.isArray(entry) || entry.length !== 3 || !entry.every((t) => isIntIn(t, 0, 119))) return false;
        out.push(entry);
        return out.length <= vertexCount;
      },
      (n, out) => {
        if (out.length + n > vertexCount) return false;
        for (let i = 0; i < n; i++) out.push([0, 0, 0]);
        return true;
      },
    );
    if (!ticks || ticks.length !== vertexCount) fail('ticks do not match vertices');
  }

  // 6, with §2's version 1 Z negation.
  const positions: number[] = new Array(vertexCount * 3);
  for (let i = 0; i < vertexCount; i++) {
    const vertex: unknown = p.vertices[i];
    if (!Array.isArray(vertex) || vertex.length !== 3 || !vertex.every(isInt)) fail('malformed vertex');
    const tick = ticks?.[i] ?? [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      positions[i * 3 + a] = (vertex[a] as number) * TICKS_PER_UNIT + tick[a];
    }
    if (version === 1) positions[i * 3 + 2] = -positions[i * 3 + 2];
  }

  // 8
  const faces: [number, number, number][] = [];
  for (const face of p.faces as unknown[]) {
    if (!Array.isArray(face) || face.length !== 3 || !face.every((f) => isIntIn(f, 0, vertexCount - 1))) {
      fail('face index out of range');
    }
    const [a, b, c] = face as [number, number, number];
    if (a === b || b === c || a === c) fail('degenerate face');
    faces.push([a, b, c]);
  }

  // 8a
  let palette = BUILTIN_PALETTE;
  let paletteRef: SnoPaletteRef | undefined;
  if (p.palette !== undefined) {
    if (typeof p.palette === 'string') {
      if (p.palette !== BUILTIN_PALETTE_NAME) {
        paletteRef = parsePaletteRef(p.palette);
        if (!paletteRef) fail('unknown palette');
      }
    } else if (Array.isArray(p.palette)) {
      palette = parseInlinePalette(p.palette) ?? fail('malformed palette');
    } else {
      fail('malformed palette');
    }
  }

  // 8b
  let colors: Rgb[];
  let colorIndices: number[] | undefined;
  if (version === 1) {
    // Literal triples, clamped (§1.3).
    colors = (p.colors as unknown[]).map((c) => {
      if (!Array.isArray(c) || c.length !== 3 || !c.every((x) => typeof x === 'number' && Number.isFinite(x))) {
        fail('malformed color');
      }
      return c.map((x: number) => Math.min(1, Math.max(0, x))) as Rgb;
    });
  } else {
    colorIndices = (p.colors as unknown[]).map((c) => (isIntIn(c, 0, palette.length - 1) ? c : fail('color index out of range')));
    colors = colorIndices.map((i) => palette[i]);
  }

  // 8c
  let faceColorIndices: number[] | undefined;
  if (p.facecolors !== undefined) {
    if (!Array.isArray(p.facecolors)) fail('malformed facecolors');
    faceColorIndices = expandRuns<number>(
      p.facecolors,
      (entry, out) => {
        if (!isIntIn(entry, 0, palette.length - 1)) return false;
        out.push(entry);
        return out.length <= faces.length;
      },
      (n, out) => {
        if (out.length === 0 || out.length + n > faces.length) return false;
        const last = out[out.length - 1];
        for (let i = 0; i < n; i++) out.push(last);
        return true;
      },
    );
    if (!faceColorIndices || faceColorIndices.length !== faces.length) fail('facecolors do not match faces');
  }

  // 9: `extent` is advisory and self-repairing; a viewer frames the object itself.

  // 10
  if (p.up !== undefined && typeof p.up !== 'boolean') fail('malformed up');
  if (p.spin !== undefined && !isIntIn(p.spin, 0, 359)) fail('malformed spin');

  // 11
  const refs: SnoRef[] = [];
  if (p.refs !== undefined) {
    if (!Array.isArray(p.refs)) fail('malformed refs');
    for (const ref of p.refs as unknown[]) {
      if (!Array.isArray(ref) || ref.length < 2 || ref.length > 3 || (ref.length === 3 && typeof ref[2] !== 'string')) {
        fail('malformed ref');
      }
      const [type, value] = ref;
      if (type === 'e' && typeof value === 'string' && isNostrId(value)) {
        refs.push({ type: 'e', id: value });
        continue;
      }
      const addr = type === 'a' && typeof value === 'string' ? parseAddr(value) : undefined;
      if (addr && addr.kind === SNO_KIND) {
        refs.push({ type: 'a', pubkey: addr.pubkey, identifier: addr.identifier });
        continue;
      }
      fail('malformed ref');
    }
  }

  // 12. The scale step's bound depends on the placed object's own unit,
  // which is only known once it's fetched; an out-of-range one is drawn as
  // a placeholder then.
  const parts: SnoPart[] = [];
  if (p.parts !== undefined) {
    if (!Array.isArray(p.parts)) fail('malformed parts');
    for (const part of p.parts as unknown[]) {
      if (
        !Array.isArray(part) || part.length !== 8 ||
        !isIntIn(part[0], 0, refs.length - 1) ||
        !part.slice(1, 4).every((t) => isIntIn(t, -7680, 7680)) ||
        !part.slice(4, 7).every((d) => isIntIn(d, 0, 359)) ||
        !isIntIn(part[7], -84, 84)
      ) {
        fail('malformed part');
      }
      parts.push({
        ref: part[0],
        offset: [part[1], part[2], part[3]],
        rotation: [part[4], part[5], part[6]],
        step: part[7],
      });
    }
  }

  return { version, name, unit, mode, positions, colors, colorIndices, faces, faceColorIndices, palette, paletteRef, refs, parts };
}

/**
 * The colors a fetched event carries as a palette (§1.3b): its `c` tags in
 * order, else the legacy JSON array in content. `undefined` when it carries
 * neither, which means keep the built-in.
 */
export function parsePaletteEvent(event: NostrEvent): Rgb[] | undefined {
  const tags = event.tags.filter(([name]) => name === 'c').map(([, value]) => value);
  if (tags.length >= 2 && tags.length <= 256 && tags.every((v) => /^#[0-9a-f]{6}$/i.test(v ?? ''))) {
    return tags.map((v) => hexToRgb(v.slice(1)));
  }
  try {
    const json: unknown = JSON.parse(event.content);
    if (!Array.isArray(json) || json.length < 2 || json.length > 256) return undefined;
    const palette: Rgb[] = [];
    for (const entry of json) {
      if (typeof entry === 'string' && /^#[0-9a-f]{6}$/i.test(entry)) {
        palette.push(hexToRgb(entry.slice(1)));
      } else if (Array.isArray(entry) && entry.length === 3 && entry.every((c) => isIntIn(c, 0, 255))) {
        palette.push([entry[0] / 255, entry[1] / 255, entry[2] / 255]);
      } else {
        return undefined;
      }
    }
    return palette;
  } catch {
    return undefined;
  }
}

/**
 * Recolor a v2 object with a fetched palette. Keeps the object as it is when
 * the palette is too short for an index it uses.
 */
export function applyPalette(object: SnoObject, palette: Rgb[]): SnoObject {
  const indices = [...(object.colorIndices ?? []), ...(object.faceColorIndices ?? [])];
  if (object.version !== 2 || indices.some((i) => i >= palette.length)) return object;
  return { ...object, palette, colors: object.colorIndices!.map((i) => palette[i]) };
}

/** Whether an SNO event's payload is encrypted to a place (§3.4), leaving only a preview in content. */
export function isEncryptedSno(event: NostrEvent): boolean {
  return event.tags.some(([name]) => name === 'encrypted');
}

/** The stable key an object goes by, for cycle detection: its address. */
export function snoEventKey(event: NostrEvent): string {
  const d = event.tags.find(([name]) => name === 'd')?.[1] ?? '';
  return `${event.kind}:${event.pubkey}:${d}`;
}

export function snoRefKey(ref: SnoRef): string {
  return ref.type === 'a' ? `${SNO_KIND}:${ref.pubkey}:${ref.identifier}` : ref.id;
}

export function snoPaletteRefKey(ref: SnoPaletteRef): string {
  return ref.type === 'nevent' ? ref.id : `${ref.kind}:${ref.pubkey}:${ref.identifier}`;
}

/**
 * Filters that fetch a set of placed objects and palettes in one request:
 * one filter per author for addresses, so a floor of 129 tiles from one
 * author is one filter, and one for every id.
 */
export function snoFetchFilters(refs: SnoRef[], paletteRefs: SnoPaletteRef[]): NostrFilter[] {
  const ids = new Set<string>();
  const byAuthor = new Map<string, Map<number, Set<string>>>();
  const addAddr = (kind: number, pubkey: string, identifier: string) => {
    const kinds = byAuthor.get(pubkey) ?? new Map<number, Set<string>>();
    const ds = kinds.get(kind) ?? new Set<string>();
    ds.add(identifier);
    kinds.set(kind, ds);
    byAuthor.set(pubkey, kinds);
  };
  for (const ref of refs) {
    if (ref.type === 'e') ids.add(ref.id);
    else addAddr(SNO_KIND, ref.pubkey, ref.identifier);
  }
  for (const ref of paletteRefs) {
    if (ref.type === 'nevent') ids.add(ref.id);
    else addAddr(ref.kind, ref.pubkey, ref.identifier);
  }

  const filters: NostrFilter[] = [];
  if (ids.size) filters.push({ ids: [...ids], limit: ids.size });
  for (const [pubkey, kinds] of byAuthor) {
    for (const [kind, ds] of kinds) {
      filters.push({ kinds: [kind], authors: [pubkey], '#d': [...ds], limit: ds.size });
    }
  }
  return filters;
}

/** Index fetched events by every key a reference might name them by, newest winning for addresses. */
export function indexFetched(events: NostrEvent[]): Map<string, NostrEvent> {
  const map = new Map<string, NostrEvent>();
  for (const event of events) {
    map.set(event.id, event);
    if (event.kind >= 30000 && event.kind < 40000) {
      const key = snoEventKey(event);
      const prev = map.get(key);
      if (!prev || event.created_at > prev.created_at) map.set(key, event);
    }
  }
  return map;
}
