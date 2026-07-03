/**
 * Looping "Happy Birthday" jingle, synthesized with the Web Audio API.
 *
 * Played while viewing the profile of someone whose NIP-24 birthday is
 * today. No audio files, no fetch, no dependencies — same approach as
 * `src/blobbi/ui/lib/munchSound.ts`.
 *
 * Styled like a cheerful handheld-RPG town theme (think Pokémon X/Y):
 * a bouncy square-wave chiptune lead with snappy staccato envelopes, a
 * soft "oom-pah" triangle bass keeping the waltz bounce, a feedback echo
 * for that roomy Game Freak sparkle, and a little ascending arpeggio
 * twinkle at the end of each pass. Everything runs through a lowpass at
 * a low master gain so it stays cute, not shrill.
 *
 * Browsers keep `AudioContext`s suspended until a user gesture. `start()`
 * attempts to resume immediately; if the context stays suspended, one-time
 * `pointerdown`/`keydown` listeners begin playback on the first interaction.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────

const MASTER_GAIN = 0.055;
const TEMPO_BPM = 132;
const BEAT_SEC = 60 / TEMPO_BPM;
/** Silence between loop passes, in beats. */
const LOOP_REST_BEATS = 4;
/** How far ahead of the current pass ending we schedule the next one. */
const LOOKAHEAD_SEC = 0.25;

// Note frequencies (Hz), equal temperament.
const G2 = 98.0;
const C3 = 130.81;
const E3 = 164.81;
const F3 = 174.61;
const G3 = 196.0;
const A3 = 220.0;
const B3 = 246.94;
const C4 = 261.63;
const D4 = 293.66;
const F4 = 349.23;
const G4 = 392.0;
const A4 = 440.0;
const B4 = 493.88;
const C5 = 523.25;
const D5 = 587.33;
const E5 = 659.25;
const F5 = 698.46;
const G5 = 783.99;
const C6 = 1046.5;

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

const MELODY_BEATS = MELODY.reduce((sum, [, beats]) => sum + beats, 0); // 26

/**
 * Waltz "oom-pah-pah" bass: [root, chordTones, startBeat] — the root lands
 * on the downbeat ("oom") and the chord tones bounce on beats 2 and 3
 * ("pah-pah"). Follows the traditional I / V7 / IV harmonization in C.
 */
const BASS_BARS: ReadonlyArray<readonly [number, readonly number[], number]> = [
  [C3, [E3, G3], 1],   // C      — "birth-day to"
  [G2, [B3, D4], 4],   // G7     — "you"
  [G2, [B3, D4], 7],   // G7     — "birth-day to"
  [C3, [E3, G3], 10],  // C      — "you"
  [C3, [E3, G3], 13],  // C      — "birth-day dear"
  [F3, [A3, C4], 16],  // F      — "friend"
  [F3, [A3, C4], 20],  // F      — "birth-day"
  [G2, [B3, F4], 23],  // G7     — "to you"
];

/** End-of-pass twinkle: a quick ascending sparkle, RPG-fanfare style. */
const SPARKLE: ReadonlyArray<readonly [number, number]> = [
  [C5, 26.5], [E5, 26.75], [G5, 27], [C6, 27.25],
];

const PASS_BEATS = MELODY_BEATS + 2 + LOOP_REST_BEATS; // melody + sparkle tail + rest
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
  /** Lead/sparkle bus — feeds the lowpass dry and the echo send wet. */
  leadBus: GainNode;
  echoNodes: AudioNode[];
  nodes: AudioNode[];
  timer: ReturnType<typeof setTimeout> | null;
  gestureCleanup: (() => void) | null;
  stopped: boolean;
}

let session: JingleSession | null = null;

/** Free an oscillator's little node graph once it finishes. */
function cleanupOnEnd(osc: OscillatorNode, nodes: AudioNode[]): void {
  osc.onended = () => {
    try {
      for (const node of nodes) node.disconnect();
    } catch {
      // Already disconnected.
    }
  };
}

/**
 * Chiptune lead note: a square wave with a snappy staccato envelope — fast
 * attack, short hold, quick release well before the note's slot ends, so
 * repeated pitches bounce instead of smearing together.
 */
function scheduleLead(s: JingleSession, freq: number, start: number, beats: number): void {
  const { ac, leadBus } = s;
  const slot = beats * BEAT_SEC;
  // Staccato gate: long notes ring a bit, short notes stay a crisp blip.
  const gate = Math.min(Math.max(slot * 0.62, 0.1), 0.9);
  const attack = 0.006;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.55, start + attack);
  gain.gain.setValueAtTime(0.42, start + gate * 0.4);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + gate);
  gain.connect(leadBus);

  const osc = ac.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(freq, start);
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + gate + 0.03);

  s.nodes.push(gain, osc);
  cleanupOnEnd(osc, [osc, gain]);
}

/** Soft triangle pluck for the waltz bass — rounder and quieter than the lead. */
function scheduleBassPluck(s: JingleSession, freq: number, start: number, level: number): void {
  const { ac, lowpass } = s;
  const gate = 0.32;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(level, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + gate);
  gain.connect(lowpass); // straight to the lowpass — keep the low end dry

  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(freq, start);
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + gate + 0.03);

  s.nodes.push(gain, osc);
  cleanupOnEnd(osc, [osc, gain]);
}

/** Bell-like sine blip for the end-of-pass sparkle. */
function scheduleSparkle(s: JingleSession, freq: number, start: number): void {
  const { ac, leadBus } = s;
  const gate = 0.28;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.4, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + gate);
  gain.connect(leadBus);

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, start);
  osc.connect(gain);
  osc.start(start);
  osc.stop(start + gate + 0.03);

  s.nodes.push(gain, osc);
  cleanupOnEnd(osc, [osc, gain]);
}

/** Schedule one full melody pass starting at `passStart`, then re-arm. */
function schedulePass(s: JingleSession, passStart: number): void {
  if (s.stopped) return;

  const at = (beats: number) => passStart + beats * BEAT_SEC;

  // Lead melody.
  let beat = 0;
  for (const [freq, beats] of MELODY) {
    scheduleLead(s, freq, at(beat), beats);
    beat += beats;
  }

  // Waltz bass: "oom" root on the downbeat, "pah-pah" chord on 2 and 3.
  for (const [root, chord, startBeat] of BASS_BARS) {
    scheduleBassPluck(s, root, at(startBeat), 0.5);
    for (let i = 0; i < 2; i++) {
      for (const tone of chord) {
        scheduleBassPluck(s, tone, at(startBeat + 1 + i), 0.16);
      }
    }
  }

  // Twinkle tail.
  for (const [freq, startBeat] of SPARKLE) {
    scheduleSparkle(s, freq, at(startBeat));
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
    lowpass.frequency.value = 3400;
    lowpass.Q.value = 0.5;

    const master = ac.createGain();
    master.gain.value = MASTER_GAIN;

    lowpass.connect(master);
    master.connect(ac.destination);

    // Lead bus with a feedback echo send — the dotted repeat is what gives
    // the chiptune its roomy, sparkly Game Freak feel.
    const leadBus = ac.createGain();
    leadBus.gain.value = 1;
    leadBus.connect(lowpass);

    const echo = ac.createDelay(1);
    echo.delayTime.value = BEAT_SEC * 0.75; // dotted-eighth echo
    const echoFeedback = ac.createGain();
    echoFeedback.gain.value = 0.3;
    const echoWet = ac.createGain();
    echoWet.gain.value = 0.22;

    leadBus.connect(echo);
    echo.connect(echoFeedback);
    echoFeedback.connect(echo);
    echo.connect(echoWet);
    echoWet.connect(lowpass);

    const s: JingleSession = {
      ac,
      master,
      lowpass,
      leadBus,
      echoNodes: [echo, echoFeedback, echoWet],
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
        for (const node of s.echoNodes) node.disconnect();
        s.leadBus.disconnect();
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
