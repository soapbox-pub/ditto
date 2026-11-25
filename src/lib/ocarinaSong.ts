/**
 * Turns a post into a short ocarina song, the kind Link learns in Ocarina of
 * Time and Majora's Mask: six to eight notes from the five ocarina buttons,
 * built on one of the shapes those songs use (a phrase played twice, a
 * call and answer, a rising run that comes home), with a rhythm to match.
 *
 * The post's text seeds everything, so a post always plays the same song.
 *
 * Synthesized with the Web Audio API like `birthdayJingle.ts`: no audio
 * files, no dependencies. The ocarina is a near-sine wave with a breathy
 * attack, a little scoop up into pitch and vibrato that swells in, played in
 * a big generated reverb over a soft drone, the way the games play a song
 * back once you've learned it.
 */

// ─── Songs ────────────────────────────────────────────────────────────────────

/** The five ocarina buttons, lowest to highest — also their staff lines, bottom to top. */
export type OcarinaButton = 'a' | 'down' | 'right' | 'left' | 'up';

export const OCARINA_BUTTONS: readonly OcarinaButton[] = ['a', 'down', 'right', 'left', 'up'];

/** D5 F5 A5 B5 D6 — the games' D dorian-ish five-note ocarina. */
const PITCH: Record<OcarinaButton, number> = {
  a: 587.33,
  down: 698.46,
  right: 880.0,
  left: 987.77,
  up: 1174.66,
};

export interface OcarinaNote {
  button: OcarinaButton;
  /** Length in beats. */
  beats: number;
}

export interface OcarinaSong {
  notes: OcarinaNote[];
  bpm: number;
  /** A word from the post to name the song after, if it has one. */
  word?: string;
}

/**
 * Song shapes: each letter is a button, and the same letter is the same
 * button. Each shape has the rhythms (in beats) that suit it.
 */
const SHAPES: ReadonlyArray<{ shape: string; rhythms: number[][] }> = [
  // A phrase played twice, like Zelda's Lullaby or Saria's Song.
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

/** FNV-1a, for turning the post into a seed. */
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

/** A word of the post to name the song after: letters only, no links or mentions. */
function pickWord(text: string, random: () => number): string | undefined {
  const words = text
    .replace(/(?:https?:\/\/|nostr:)\S+/g, ' ')
    .match(/\p{L}{4,}/gu);
  if (!words) return undefined;
  const word = pick(random, words).slice(0, 12);
  return word.charAt(0).toLocaleUpperCase() + word.slice(1).toLocaleLowerCase();
}

/** Compose the song for a piece of text. The same text always gives the same song. */
export function composeOcarinaSong(text: string): OcarinaSong {
  const random = seededRandom(hashString(text));

  const { shape, rhythms } = pick(random, SHAPES);
  const rhythm = pick(random, rhythms);

  // Deal the buttons out to the shape's letters.
  const deck = [...OCARINA_BUTTONS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  const notes = [...shape].map((letter, i) => ({
    button: deck[letter.charCodeAt(0) - 97],
    beats: rhythm[i],
  }));

  return {
    notes,
    bpm: 96 + Math.floor(random() * 40),
    word: pickWord(text, random),
  };
}

// ─── Audio ────────────────────────────────────────────────────────────────────

const MASTER_GAIN = 0.22;
const REVERB_SEC = 2.6;
/** Drone under the song: D4 and A4. */
const DRONE = [293.66, 440.0];

let ctx: AudioContext | null = null;
let ocarinaWave: PeriodicWave | null = null;
let noiseBuffer: AudioBuffer | null = null;
let reverbBuffer: AudioBuffer | null = null;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    ctx = null;
  }
  return ctx;
}

/**
 * Wake the audio context. Call this from the tap that leads to playback:
 * iOS only lets audio start inside a user gesture, and the song starts a
 * moment later, once its dialog has opened.
 */
export function primeOcarina(): void {
  const ac = getContext();
  if (ac?.state === 'suspended') void ac.resume().catch(() => {});
}

/** Almost a sine, with a whisper of overtones so it reads as a wind instrument. */
function getOcarinaWave(ac: AudioContext): PeriodicWave {
  ocarinaWave ??= ac.createPeriodicWave(
    new Float32Array([0, 1, 0.1, 0.04, 0.015]),
    new Float32Array(5),
  );
  return ocarinaWave;
}

function getNoiseBuffer(ac: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  noiseBuffer = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}

/** A big, soft hall: decaying stereo noise. */
function getReverbBuffer(ac: AudioContext): AudioBuffer {
  if (reverbBuffer) return reverbBuffer;
  const length = Math.floor(ac.sampleRate * REVERB_SEC);
  reverbBuffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = reverbBuffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
  }
  return reverbBuffer;
}

interface Voice {
  ac: AudioContext;
  /** Feeds the master both dry and through the reverb. */
  bus: GainNode;
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
}

/** One ocarina note, held from `start` for `length` seconds. */
function scheduleNote(v: Voice, freq: number, start: number, length: number): void {
  const { ac, bus } = v;
  // Release a touch before the next note and let the reverb carry the rest.
  const release = Math.max(start + 0.12, start + length - 0.05);
  const stop = release + 0.25;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.5, start + 0.035);
  gain.gain.linearRampToValueAtTime(0.4, start + 0.12);
  gain.gain.setValueAtTime(0.4, release);
  gain.gain.exponentialRampToValueAtTime(0.0001, release + 0.2);
  gain.connect(bus);

  const osc = ac.createOscillator();
  osc.setPeriodicWave(getOcarinaWave(ac));
  // Scoop up into the note, as breath settles on it.
  osc.frequency.setValueAtTime(freq * 0.985, start);
  osc.frequency.exponentialRampToValueAtTime(freq, start + 0.06);
  osc.connect(gain);

  // Vibrato that swells in on held notes.
  const lfo = ac.createOscillator();
  lfo.frequency.value = 5.2;
  const depth = ac.createGain();
  depth.gain.setValueAtTime(0, start);
  depth.gain.setValueAtTime(0, start + 0.2);
  depth.gain.linearRampToValueAtTime(freq * 0.006, start + 0.55);
  lfo.connect(depth);
  depth.connect(osc.frequency);

  // Breath: a puff of hiss on the attack, then a faint steady air.
  const breath = ac.createBufferSource();
  breath.buffer = getNoiseBuffer(ac);
  breath.loop = true;
  const breathFilter = ac.createBiquadFilter();
  breathFilter.type = 'bandpass';
  breathFilter.frequency.value = freq * 2;
  breathFilter.Q.value = 0.8;
  const breathGain = ac.createGain();
  breathGain.gain.setValueAtTime(0.0001, start);
  breathGain.gain.linearRampToValueAtTime(0.16, start + 0.02);
  breathGain.gain.exponentialRampToValueAtTime(0.03, start + 0.14);
  breathGain.gain.setValueAtTime(0.03, release);
  breathGain.gain.exponentialRampToValueAtTime(0.0001, release + 0.15);
  breath.connect(breathFilter);
  breathFilter.connect(breathGain);
  breathGain.connect(bus);

  for (const source of [osc, lfo, breath]) {
    source.start(start);
    source.stop(stop);
  }
  v.sources.push(osc, lfo, breath);
  v.nodes.push(gain, depth, breathFilter, breathGain);
}

/** The soft drone under the song, fading in and out around it. */
function scheduleDrone(v: Voice, start: number, end: number): void {
  const { ac, bus } = v;
  for (const freq of DRONE) {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(0.05, start + 0.8);
    gain.gain.setValueAtTime(0.05, end);
    gain.gain.exponentialRampToValueAtTime(0.0001, end + 1.4);
    gain.connect(bus);

    // Two slightly detuned voices, for warmth.
    for (const detune of [-6, 6]) {
      const osc = ac.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start(start);
      osc.stop(end + 1.5);
      v.sources.push(osc);
    }
    v.nodes.push(gain);
  }
}

/** A little two-note chime once the song is done. */
function scheduleChime(v: Voice, start: number): void {
  const { ac, bus } = v;
  [1174.66, 1760.0].forEach((freq, i) => {
    const at = start + i * 0.1;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    gain.connect(bus);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 0.75);
    v.sources.push(osc);
    v.nodes.push(gain);
  });
}

interface PlayCallbacks {
  /** A note starts sounding. */
  onNote?: (index: number) => void;
  /** The song, and its chime, are done. */
  onEnd?: () => void;
}

/**
 * Play the song once. Returns a function that stops it early. Errors are
 * swallowed: music must never break the page.
 */
export function playOcarinaSong(song: OcarinaSong, { onNote, onEnd }: PlayCallbacks = {}): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let voice: Voice | null = null;
  let master: GainNode | null = null;
  let stopped = false;

  const begin = () => {
    const ac = getContext();
    if (stopped || !ac) return;

    master = ac.createGain();
    master.gain.value = MASTER_GAIN;
    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 5200;
    lowpass.connect(master);
    master.connect(ac.destination);

    const bus = ac.createGain();
    bus.connect(lowpass);
    const reverb = ac.createConvolver();
    reverb.buffer = getReverbBuffer(ac);
    const wet = ac.createGain();
    wet.gain.value = 0.45;
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(lowpass);

    const v: Voice = { ac, bus, nodes: [master, lowpass, bus, reverb, wet], sources: [] };
    voice = v;

    const beat = 60 / song.bpm;
    const songStart = ac.currentTime + 0.25;
    let at = songStart;
    song.notes.forEach((note, i) => {
      const length = note.beats * beat;
      scheduleNote(v, PITCH[note.button], at, length);
      timers.push(setTimeout(() => onNote?.(i), (at - ac.currentTime) * 1000));
      at += length;
    });

    scheduleDrone(v, songStart - 0.2, at);
    scheduleChime(v, at);
    timers.push(setTimeout(() => onEnd?.(), (at + 0.6 - ac.currentTime) * 1000));
  };

  try {
    const ac = getContext();
    if (!ac) {
      onEnd?.();
      return () => {};
    }
    if (ac.state === 'running') begin();
    else void ac.resume().then(begin).catch(() => onEnd?.());
  } catch {
    onEnd?.();
  }

  return () => {
    if (stopped) return;
    stopped = true;
    for (const timer of timers) clearTimeout(timer);
    const v = voice;
    if (!v || !master) return;

    try {
      // Fade quickly instead of clicking off, then free everything.
      const now = v.ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value, now);
      master.gain.linearRampToValueAtTime(0.0001, now + 0.15);
      setTimeout(() => {
        for (const source of v.sources) {
          try {
            source.stop();
          } catch {
            // Already stopped.
          }
        }
        for (const node of [...v.sources, ...v.nodes]) node.disconnect();
      }, 200);
    } catch {
      // Never let teardown throw.
    }
  };
}
