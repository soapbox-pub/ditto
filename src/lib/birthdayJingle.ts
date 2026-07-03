/**
 * Looping "Happy Birthday" jingle, synthesized with the Web Audio API.
 *
 * Played while viewing the profile of someone whose NIP-24 birthday is
 * today. No audio files, no fetch, no dependencies — same approach as
 * `src/blobbi/ui/lib/munchSound.ts`.
 *
 * A soft music-box timbre: a triangle-wave lead with a quiet detuned sine
 * an octave up, run through a gentle lowpass so it sits politely in the
 * background instead of demanding attention.
 *
 * Browsers keep `AudioContext`s suspended until a user gesture. `start()`
 * attempts to resume immediately; if the context stays suspended, one-time
 * `pointerdown`/`keydown` listeners begin playback on the first interaction.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────

const MASTER_GAIN = 0.07;
const TEMPO_BPM = 116;
const BEAT_SEC = 60 / TEMPO_BPM;
/** Silence between loop passes, in beats. */
const LOOP_REST_BEATS = 4;
/** How far ahead of the current pass ending we schedule the next one. */
const LOOKAHEAD_SEC = 0.25;

// Note frequencies (Hz), equal temperament.
const G4 = 392.0;
const A4 = 440.0;
const B4 = 493.88;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const F5 = 698.46;
const G5 = 783.99;

/** [frequency, duration in beats] — the traditional melody in C major. */
const MELODY: ReadonlyArray<readonly [number, number]> = [
  // Happy birthday to you
  [G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [C5, 1], [B4, 2],
  // Happy birthday to you
  [G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [D5, 1], [C5, 2],
  // Happy birthday dear friend
  [G4, 0.75], [G4, 0.25], [G5, 1], [E5, 1], [C5, 1], [B4, 1], [A4, 2],
  // Happy birthday to you
  [F5, 0.75], [F5, 0.25], [E5, 1], [C5, 1], [D5, 1], [C5, 3],
];

const PASS_BEATS = MELODY.reduce((sum, [, beats]) => sum + beats, 0) + LOOP_REST_BEATS;
const PASS_SEC = PASS_BEATS * BEAT_SEC;

// ─── AudioContext singleton ───────────────────────────────────────────────────

let ctx: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    ctx = null;
  }
  return ctx;
}

// ─── Scheduling ───────────────────────────────────────────────────────────────

interface JingleSession {
  ac: AudioContext;
  master: GainNode;
  lowpass: BiquadFilterNode;
  nodes: AudioNode[];
  timer: ReturnType<typeof setTimeout> | null;
  gestureCleanup: (() => void) | null;
  stopped: boolean;
}

let session: JingleSession | null = null;

/** Schedule a single note (lead + soft octave shimmer) at an absolute time. */
function scheduleNote(s: JingleSession, freq: number, start: number, beats: number): void {
  const { ac, lowpass } = s;
  const dur = beats * BEAT_SEC;
  // Small gap between notes so repeated pitches articulate.
  const soundEnd = start + Math.max(dur - 0.06, 0.09);
  const attack = 0.015;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(1, start + attack);
  gain.gain.setValueAtTime(1, start + (soundEnd - start) * 0.45);
  gain.gain.exponentialRampToValueAtTime(0.0001, soundEnd);
  gain.connect(lowpass);

  const lead = ac.createOscillator();
  lead.type = 'triangle';
  lead.frequency.setValueAtTime(freq, start);

  const leadGain = ac.createGain();
  leadGain.gain.setValueAtTime(0.8, start);
  lead.connect(leadGain);
  leadGain.connect(gain);
  lead.start(start);
  lead.stop(soundEnd + 0.02);

  // Quiet octave-up sine for a music-box sparkle.
  const shimmer = ac.createOscillator();
  shimmer.type = 'sine';
  shimmer.frequency.setValueAtTime(freq * 2, start);

  const shimmerGain = ac.createGain();
  shimmerGain.gain.setValueAtTime(0.16, start);
  shimmer.connect(shimmerGain);
  shimmerGain.connect(gain);
  shimmer.start(start);
  shimmer.stop(soundEnd + 0.02);

  s.nodes.push(gain, lead, leadGain, shimmer, shimmerGain);

  // Free finished nodes so long viewing sessions don't accumulate them.
  lead.onended = () => {
    try {
      lead.disconnect();
      leadGain.disconnect();
      shimmer.disconnect();
      shimmerGain.disconnect();
      gain.disconnect();
    } catch {
      // Already disconnected.
    }
  };
}

/** Schedule one full melody pass starting at `passStart`, then re-arm. */
function schedulePass(s: JingleSession, passStart: number): void {
  if (s.stopped) return;

  let t = passStart;
  for (const [freq, beats] of MELODY) {
    scheduleNote(s, freq, t, beats);
    t += beats * BEAT_SEC;
  }

  // Arm the next pass shortly before this one finishes.
  const nextStart = passStart + PASS_SEC;
  const delayMs = Math.max((nextStart - s.ac.currentTime - LOOKAHEAD_SEC) * 1000, 0);
  s.timer = setTimeout(() => schedulePass(s, nextStart), delayMs);
}

function beginPlayback(s: JingleSession): void {
  if (s.stopped) return;
  schedulePass(s, s.ac.currentTime + 0.1);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start the looping birthday jingle. Idempotent — calling while already
 * playing is a no-op. Errors are swallowed; music must never break the page.
 */
export function startBirthdayJingle(): void {
  if (session) return;

  try {
    const ac = getContext();
    if (!ac) return;

    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 2600;
    lowpass.Q.value = 0.5;

    const master = ac.createGain();
    master.gain.value = MASTER_GAIN;

    lowpass.connect(master);
    master.connect(ac.destination);

    const s: JingleSession = {
      ac,
      master,
      lowpass,
      nodes: [],
      timer: null,
      gestureCleanup: null,
      stopped: false,
    };
    session = s;

    if (ac.state === 'suspended') {
      // Try to resume right away (works when a gesture already unlocked
      // audio this session); otherwise wait for the first interaction.
      void ac.resume().catch(() => {});

      const onGesture = () => {
        cleanup();
        void ac.resume().then(() => {
          if (!s.stopped && ac.state === 'running') beginPlayback(s);
        }).catch(() => {});
      };
      const cleanup = () => {
        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
        s.gestureCleanup = null;
      };
      window.addEventListener('pointerdown', onGesture);
      window.addEventListener('keydown', onGesture);
      s.gestureCleanup = cleanup;

      // If resume() succeeded immediately, start now.
      if ((ac.state as AudioContextState) === 'running') {
        cleanup();
        beginPlayback(s);
      }
    } else {
      beginPlayback(s);
    }
  } catch {
    session = null;
  }
}

/** Stop the jingle with a quick fade-out and release all audio nodes. */
export function stopBirthdayJingle(): void {
  const s = session;
  if (!s) return;
  session = null;
  s.stopped = true;

  try {
    if (s.timer !== null) clearTimeout(s.timer);
    s.gestureCleanup?.();

    // Quick fade to avoid a click, then disconnect everything.
    const now = s.ac.currentTime;
    s.master.gain.cancelScheduledValues(now);
    s.master.gain.setValueAtTime(s.master.gain.value, now);
    s.master.gain.linearRampToValueAtTime(0.0001, now + 0.15);

    setTimeout(() => {
      try {
        for (const node of s.nodes) node.disconnect();
        s.lowpass.disconnect();
        s.master.disconnect();
      } catch {
        // Already disconnected.
      }
    }, 200);
  } catch {
    // Never let audio teardown throw.
  }
}
