import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Ocarina songs (kind 1853, see NIP.md): a short melody for a five-hole
 * ocarina, stored as `note` tags. The format, and the way any event is read
 * into a song, follow oota (https://oota.app), so a post makes the same song
 * there and here.
 */

/** Numbered for 1853, the year Giuseppe Donati made the first modern ocarina. */
export const OCARINA_SONG_KIND = 1853;

/**
 * The five holes, lowest to highest: the games' A button, then C-down,
 * C-right, C-left and C-up. Also their staff lines, bottom to top.
 */
export type Step = 0 | 1 | 2 | 3 | 4;
export const STEPS: readonly Step[] = [0, 1, 2, 3, 4];

/** A bend in semitones, up to three either way: B4 under the low hole, F6 over the high one. */
export type Bend = -3 | -2 | -1 | 0 | 1 | 2 | 3;
const MAX_BEND = 3;

export interface SongNote {
  step: Step;
  /** Length in beats: one of BEAT_VALUES. */
  beats: number;
  bend: Bend;
}

/** The event a song was made of, and whose it was. */
export interface SongLink {
  id: string;
  relay?: string;
  pubkey?: string;
  kind?: number;
  /** `<kind>:<pubkey>:<d>`, when it's addressable. */
  address?: string;
}

export interface Song {
  notes: SongNote[];
  bpm: number;
  title?: string;
  link?: SongLink;
}

export interface SongPost extends Song {
  event: NostrEvent;
}

export const BEAT_VALUES = [0.5, 1, 1.5, 2, 3, 4] as const;
const MIN_NOTES = 3;
const MAX_NOTES = 16;
const MIN_BPM = 40;
const MAX_BPM = 220;
const DEFAULT_BPM = 100;
const TITLE_MAX = 40;

/** The five holes as MIDI notes: D5 F5 A5 B5 D6. */
const HOLES = [74, 77, 81, 83, 86] as const;

export function noteMidi(note: Pick<SongNote, 'step' | 'bend'>): number {
  return HOLES[note.step] + note.bend;
}

/** A bend as it's written: a sharp or a flat for each semitone. */
export function bendMark(bend: Bend): string {
  return (bend > 0 ? '♯' : '♭').repeat(Math.abs(bend));
}

/**
 * A pitch as the five holes write it: the hole that needs the least bending,
 * and of two that need the same, the lower one bent up. Null outside B4 to F6.
 */
function spell(midi: number): Pick<SongNote, 'step' | 'bend'> | null {
  for (let by = 0; by <= MAX_BEND; by++) {
    for (const bend of [by, -by] as Bend[]) {
      const step = STEPS.find((hole) => noteMidi({ step: hole, bend }) === midi);
      if (step !== undefined) return { step, bend };
    }
  }
  return null;
}

const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** A MIDI note by name, middle C being C4: 74 is "D5". */
function pitchName(midi: number): string {
  return `${PITCH_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

/** Build the unsigned event for a song. */
export function songToEvent(song: Song): { kind: number; content: string; tags: string[][]; created_at: number } {
  const tags: string[][] = song.notes.map((n) => ['note', String(noteMidi(n)), String(n.beats)]);
  tags.push(['bpm', String(Math.round(song.bpm))]);
  const title = song.title?.trim();
  if (title) tags.push(['title', title.slice(0, TITLE_MAX)]);
  if (song.link) {
    const { id, relay = '', pubkey, kind, address } = song.link;
    tags.push(pubkey ? ['e', id, relay, pubkey] : relay ? ['e', id, relay] : ['e', id]);
    if (address) tags.push(relay ? ['a', address, relay] : ['a', address]);
    // Credit whoever wrote what the song was made of.
    if (pubkey) tags.push(['p', pubkey]);
    if (kind !== undefined) tags.push(['k', String(kind)]);
  }
  const pitches = song.notes.map((n) => pitchName(noteMidi(n))).join(' ');
  tags.push(['alt', `Ocarina song${title ? ` "${title}"` : ''}: ${pitches}`]);

  return { kind: OCARINA_SONG_KIND, content: '', tags, created_at: Math.floor(Date.now() / 1000) };
}

/** Parse and validate a song event. Returns null for anything malformed. */
export function parseSong(event: NostrEvent): SongPost | null {
  if (event.kind !== OCARINA_SONG_KIND) return null;

  const notes: SongNote[] = [];
  for (const [name, midi, beats] of event.tags) {
    if (name !== 'note') continue;
    const fingered = String(Number(midi)) === midi ? spell(Number(midi)) : null;
    const length = BEAT_VALUES.find((value) => String(value) === beats);
    if (!fingered || length === undefined) return null;
    notes.push({ ...fingered, beats: length });
  }
  if (notes.length < MIN_NOTES || notes.length > MAX_NOTES) return null;

  const bpmTag = Number(event.tags.find(([name]) => name === 'bpm')?.[1]);
  const bpm = Number.isFinite(bpmTag) ? Math.min(MAX_BPM, Math.max(MIN_BPM, bpmTag)) : DEFAULT_BPM;

  const title = event.tags.find(([name]) => name === 'title')?.[1]?.trim().slice(0, TITLE_MAX) || undefined;

  const [, id, relay, pubkey] = event.tags.find(([name, id]) => name === 'e' && /^[0-9a-f]{64}$/.test(id ?? '')) ?? [];
  const kindTag = event.tags.find(([name]) => name === 'k')?.[1] ?? '';
  const kind = /^\d{1,5}$/.test(kindTag) ? Number(kindTag) : undefined;
  const address = event.tags.find(([name, value]) => name === 'a' && /^\d{1,5}:[0-9a-f]{64}:/.test(value ?? ''))?.[1];
  const link = id
    ? { id, relay: relay?.startsWith('wss://') ? relay : undefined, pubkey: /^[0-9a-f]{64}$/.test(pubkey ?? '') ? pubkey : undefined, kind, address }
    : undefined;

  return { event, notes, bpm, title, link };
}

/** How long a song lasts, in seconds. */
export function songSeconds(song: Pick<Song, 'notes' | 'bpm'>): number {
  return song.notes.reduce((sum, note) => sum + note.beats, 0) * (60 / song.bpm);
}

// ─── Making songs of things ───────────────────────────────────────────────────
//
// Each is read the same way every time, so the same event always gives the
// same song: a colour moment by its colours, a Grimoire spell by its spell,
// anything else by its words.

/** Espy's colour moments: three to six colours, an emoji, maybe a name. */
const COLOR_MOMENT_KIND = 3367;

interface ColorMoment {
  colors: string[];
  emoji?: string;
  name?: string;
}

function parseColorMoment(event: NostrEvent): ColorMoment | null {
  if (event.kind !== COLOR_MOMENT_KIND) return null;
  const colors = event.tags.filter(([name, value]) => name === 'c' && /^#[0-9a-f]{6}$/i.test(value ?? '')).map(([, value]) => value);
  if (colors.length < 3) return null;
  return {
    colors: colors.slice(0, 8),
    emoji: event.content.trim() || undefined,
    name: event.tags.find(([name]) => name === 'name')?.[1]?.trim() || undefined,
  };
}

/** Hue in degrees, saturation and lightness from 0 to 1. */
function hsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

/**
 * A colour as a note: round the wheel from red, low, to violet, high, lifted
 * or lowered by how much paler or deeper it is than its palette. A grey is
 * only as high as it is light. Vivid colours are short, dull ones linger.
 */
function colorNote(hex: string, light: number): SongNote {
  const { h, s, l } = hsl(hex);
  const grey = s < 0.15 || l < 0.06 || l > 0.96;
  const lift = Math.sign(l - light) * (Math.abs(l - light) > 0.25 ? 2 : Math.abs(l - light) > 0.06 ? 1 : 0);
  const hole = grey ? Math.round(l * 4) : Math.floor(((h + 36) % 360) / 72) + lift;
  return { step: Math.max(0, Math.min(4, hole)) as Step, bend: 0, beats: s >= 0.6 && !grey ? 1 : s >= 0.3 && !grey ? 1.5 : 2 };
}

/** A palette played out and back, ending on its first colour, held. Brighter moments are quicker. */
function colorSong(moment: ColorMoment, link: SongLink): Song {
  const light = moment.colors.reduce((sum, c) => sum + hsl(c).l, 0) / moment.colors.length;
  const there = moment.colors.slice(0, Math.ceil(MAX_NOTES / 2)).map((c) => colorNote(c, light));
  const notes = [...there, ...there.slice(0, -1).reverse()];
  notes[notes.length - 1] = { ...notes[notes.length - 1], beats: 3 };
  const title = moment.name ?? `colours of ${moment.emoji ?? 'a moment'}`;
  return { notes, bpm: Math.round(60 + light * 70), title: title.slice(0, TITLE_MAX), link };
}

/**
 * Song shapes, from the songs Link learns: a phrase played twice, a call and
 * answer, a run out and home. Each letter is a hole, and the same letter is
 * the same hole. Each shape has the rhythms, in beats, that suit it.
 */
const SHAPES: ReadonlyArray<{ shape: string; rhythms: number[][] }> = [
  // A phrase played twice.
  { shape: 'abcabc', rhythms: [[2, 1, 3, 2, 1, 3], [1, 1, 2, 1, 1, 3], [1.5, 0.5, 2, 1.5, 0.5, 3]] },
  // Twice, with a new last note.
  { shape: 'abcabd', rhythms: [[2, 1, 3, 2, 1, 3], [1, 1, 2, 1, 1, 3]] },
  // Out and back.
  { shape: 'abacba', rhythms: [[1, 1, 1, 1, 1, 3], [1.5, 0.5, 1, 1.5, 0.5, 3]] },
  { shape: 'ababca', rhythms: [[1, 1, 1, 1, 2, 3], [0.5, 0.5, 0.5, 0.5, 1, 3]] },
  { shape: 'abcbad', rhythms: [[1, 1, 2, 1, 1, 3]] },
  // Rocking pairs, like a bolero.
  { shape: 'ababcbcb', rhythms: [[1, 0.5, 1, 0.5, 1, 0.5, 1, 3], [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 3]] },
  // A slow serenade with a held repeat.
  { shape: 'abccd', rhythms: [[1, 1, 1.5, 0.5, 4], [2, 1, 1, 2, 4]] },
  { shape: 'abbcabd', rhythms: [[1, 0.5, 0.5, 2, 1, 1, 3]] },
  { shape: 'abcabcba', rhythms: [[1, 1, 1, 1, 1, 1, 1, 3], [1, 0.5, 0.5, 1, 0.5, 0.5, 1, 3]] },
  { shape: 'ababcdc', rhythms: [[0.5, 0.5, 0.5, 0.5, 1, 1, 3]] },
  { shape: 'abacade', rhythms: [[1, 1, 1, 1, 1, 1, 3]] },
];

/** FNV-1a, for turning words into a seed. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: a small seeded random number generator. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** A word to name the song after: letters only, no links or mentions. */
function pickWord(text: string, random: () => number): string | undefined {
  const words = text.replace(/(?:https?:\/\/|nostr:)\S+/g, ' ').match(/\p{L}{4,}/gu);
  return words ? pick(random, words).slice(0, 12).toLocaleLowerCase() : undefined;
}

/** Words as a song, on one of the shapes above. */
function wordSong(text: string, link: SongLink): Song {
  const words = text.trim();
  const random = seededRandom(hashString(words));
  const { shape, rhythms } = pick(random, SHAPES);
  const rhythm = pick(random, rhythms);

  // Deal the holes out to the shape's letters.
  const deck = [...STEPS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const notes = [...shape].map((letter, i) => ({ step: deck[letter.charCodeAt(0) - 97], bend: 0 as const, beats: rhythm[i] }));
  const bpm = 96 + Math.floor(random() * 40);
  const word = pickWord(words, random);
  return { notes, bpm, title: word ? `song of ${word}` : 'the nameless song', link };
}

/** A Grimoire spell: a relay query saved as kind 777. */
const RUNE_KIND = 777;

/** A Grimoire spell read as words: its name, what it's for, and the query written out as it's typed. */
function runeWords(event: NostrEvent): { name: string; words: string } | null {
  if (event.kind !== RUNE_KIND) return null;
  const all = (name: string) => event.tags.filter(([tag]) => tag === name);
  const cmd = all('cmd')[0]?.[1];
  if (!cmd || all('client')[0]?.[1] !== 'grimoire') return null;

  const words = [cmd.toLowerCase()];
  const flag = (mark: string, values: (string | undefined)[]) => {
    const given = values.filter((value): value is string => !!value);
    if (given.length) words.push(mark, given.join(','));
  };
  flag('-k', all('k').map(([, kind]) => kind));
  flag('-a', all('authors').flatMap(([, ...who]) => who).map((who) => (who.length === 64 ? `${who.slice(0, 8)}…` : who)));
  for (const [, letter, ...values] of all('tag')) flag(`-${letter}`, values);
  flag('--search', [all('search')[0]?.[1]]);
  flag('--since', [all('since')[0]?.[1]]);
  flag('--until', [all('until')[0]?.[1]]);
  flag('-l', [all('limit')[0]?.[1]]);

  const about = event.content.trim() || undefined;
  const name = all('name')[0]?.[1]?.trim() || about?.slice(0, TITLE_MAX) || 'a spell with no name';
  return { name, words: [name, about, words.join(' ')].filter(Boolean).join('\n') };
}

/** A song's link to the event it was made of: which it is, what kind, where it lives if it's addressable, and whose. */
function linkTo(event: NostrEvent, relay?: string): SongLink {
  const d = event.kind >= 30000 && event.kind < 40000 ? event.tags.find(([name]) => name === 'd')?.[1] : undefined;
  return { id: event.id, relay, pubkey: event.pubkey, kind: event.kind, address: d !== undefined ? `${event.kind}:${event.pubkey}:${d}` : undefined };
}

/** What an event is read by: a profile by its name and what it says of itself, anything else by what it says, or its id when it says nothing. */
function eventWords(event: NostrEvent): string {
  if (event.kind === 0) {
    try {
      const { display_name, name, about } = JSON.parse(event.content) as Record<string, unknown>;
      const words = [display_name || name, about].filter((part): part is string => typeof part === 'string' && !!part.trim());
      if (words.length) return words.join('\n');
    } catch {
      // Not a profile after all.
    }
  }
  return event.content.trim() ? event.content : event.id;
}

/** Any event as a song, linked back to it and crediting its author. */
export function eventSong(event: NostrEvent, relay?: string): Song {
  const link = linkTo(event, relay);
  const moment = parseColorMoment(event);
  if (moment) return colorSong(moment, link);
  const rune = runeWords(event);
  if (rune) return { ...wordSong(rune.words, link), title: rune.name.slice(0, TITLE_MAX) };
  return wordSong(eventWords(event), link);
}
