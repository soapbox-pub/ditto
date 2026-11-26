/**
 * Plays ocarina songs (see `ocarinaSong.ts`) with the Web Audio API, like
 * `birthdayJingle.ts`: no audio files, no dependencies. The ocarina is a
 * near-sine wave with a breathy attack, a little scoop up into pitch and
 * vibrato that swells in, played in a big generated reverb over a soft drone,
 * the way the games play a song back once you've learned it.
 */

import { noteMidi, type Song } from '@/lib/ocarinaSong';

const MASTER_GAIN = 0.22;
const REVERB_SEC = 2.6;
/** Drone under the song: D4 and A4. */
const DRONE = [62, 69];

let ctx: AudioContext | null = null;
let ocarinaWave: PeriodicWave | null = null;
let proceedWave: PeriodicWave | null = null;
let noiseBuffer: AudioBuffer | null = null;
let reverbBuffer: AudioBuffer | null = null;

function midiFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

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
 * iOS only lets audio start inside a user gesture, and the song may start a
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
  for (const midi of DRONE) {
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
      osc.frequency.value = midiFrequency(midi);
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start(start);
      osc.stop(end + 1.5);
      v.sources.push(osc);
    }
    v.nodes.push(gain);
  }
}

/** Bright little sine pings, one after another, freeing themselves when done. */
function scheduleChime(ac: AudioContext, out: AudioNode, start: number, midis: number[], spacing: number): void {
  midis.forEach((midi, i) => {
    const at = start + i * spacing;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.18, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.7);
    gain.connect(out);

    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = midiFrequency(midi);
    osc.connect(gain);
    osc.start(at);
    osc.stop(at + 0.75);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  });
}

/** A quiet output for the little interface sounds. */
function quietOut(ac: AudioContext): GainNode {
  const out = ac.createGain();
  out.gain.value = MASTER_GAIN;
  out.connect(ac.destination);
  setTimeout(() => out.disconnect(), 2000);
  return out;
}

/** The rising fanfare for a song shared. */
export function playFanfare(): void {
  try {
    const ac = getContext();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    scheduleChime(ac, quietOut(ac), ac.currentTime + 0.05, [81, 85, 88, 93], 0.12);
  } catch {
    // Silence is fine.
  }
}

/**
 * The note Ocarina of Time sounds when you press on past a box of words: all
 * but a pure G, scooped up into from the E below. It swells and falls away at
 * once, then hums on quietly for a moment before it goes.
 */
export function playProceed(): void {
  try {
    const ac = getContext();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    const at = ac.currentTime + 0.005;
    const end = at + 0.55;

    proceedWave ??= ac.createPeriodicWave(new Float32Array(5), new Float32Array([0, 1, 0.01, 0.015, 0.03]));
    const osc = ac.createOscillator();
    osc.setPeriodicWave(proceedWave);
    osc.frequency.setValueAtTime(midiFrequency(64) * 0.995, at);
    osc.frequency.exponentialRampToValueAtTime(midiFrequency(67), at + 0.025);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.55, at + 0.025);
    gain.gain.setValueAtTime(0.55, at + 0.045);
    gain.gain.exponentialRampToValueAtTime(0.12, at + 0.11);
    gain.gain.linearRampToValueAtTime(0.1, at + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.03, at + 0.5);
    gain.gain.linearRampToValueAtTime(0.0001, end);
    osc.connect(gain);
    gain.connect(quietOut(ac));
    osc.start(at);
    osc.stop(end + 0.02);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch {
    // Silence is fine.
  }
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
export function playOcarinaSong(song: Pick<Song, 'notes' | 'bpm'>, { onNote, onEnd }: PlayCallbacks = {}): () => void {
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
      scheduleNote(v, midiFrequency(noteMidi(note)), at, length);
      timers.push(setTimeout(() => onNote?.(i), (at - ac.currentTime) * 1000));
      at += length;
    });

    scheduleDrone(v, songStart - 0.2, at);
    scheduleChime(ac, bus, at, [86, 93], 0.1);
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
