/**
 * Looping "Happy Birthday" jingle, synthesized with the Web Audio API.
 *
 * Played while viewing the profile of someone whose NIP-24 birthday is
 * today. No audio files, no fetch, no dependencies — same approach as
 * `src/blobbi/ui/lib/munchSound.ts`.
 *
 * Styled like a cheerful handheld-RPG town theme (think Pokémon X/Y):
 * a bouncy square-wave chiptune lead doubled by a glockenspiel chime an
 * octave up (sine fundamental + fast-decaying inharmonic bell partial),
 * snappy staccato envelopes, a soft "oom-pah" triangle bass keeping the
 * waltz bounce, a feedback echo for that roomy Game Freak sparkle, and a
 * turnaround twinkle inside the final bar. The whole pass sits on a
 * strict 8-bar 3/4 grid, so it loops gaplessly — the next pickup lands
 * exactly on the final bar's third beat, like game BGM. Everything runs
 * through a lowpass at a low master gain so it stays cute, not shrill.
 *
 * Browsers keep `AudioContext`s suspended until a user gesture. `start()`
 * attempts to resume immediately; if the context stays suspended, one-time
 * `pointerdown`/`keydown` listeners begin playback on the first interaction.
 */

// ─── Tuning ───────────────────────────────────────────────────────────────────

const MASTER_GAIN = 0.09;
const TEMPO_BPM = 132;
const BEAT_SEC = 60 / TEMPO_BPM;
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

/**
 * [frequency, duration in beats] — the traditional melody in C major, laid
 * out on a strict 8-bar 3/4 grid (24 beats) so the loop is seamless: the
 * song opens with a one-beat pickup ("hap-py") on beat 3 of a bar, and the
 * final bar's beat 3 is exactly where the next pass's pickup lands. Each
 * phrase is 6 beats; the staccato envelopes articulate the held notes, so
 * slot spacing (not ring length) is what keeps the grid true.
 */
const MELODY: ReadonlyArray<readonly [number, number]> = [
  // Happy birthday to you        (pickup + bars 1-2)
  [G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [C5, 1], [B4, 2],
  // Happy birthday to you        (pickup + bars 3-4)
  [G4, 0.75], [G4, 0.25], [A4, 1], [G4, 1], [D5, 1], [C5, 2],
  // Happy birthday dear friend   (pickup + bars 5-6)
  [G4, 0.75], [G4, 0.25], [G5, 1], [E5, 1], [C5, 1], [B4, 1], [A4, 1],
  // Happy birthday to you        (pickup + bars 7-8)
  [F5, 0.75], [F5, 0.25], [E5, 1], [C5, 1], [D5, 1], [C5, 2],
];

const MELODY_BEATS = MELODY.reduce((sum, [, beats]) => sum + beats, 0); // 24

/**
 * Waltz "oom-pah-pah" bass: [root, chordTones, startBeat] — the root lands
 * on the downbeat ("oom") and the chord tones bounce on beats 2 and 3
 * ("pah-pah"). Follows the traditional I / V7 / IV harmonization in C.
 * One entry per bar; the final bar's second "pah" doubles the next pass's
 * pickup, exactly as a looping waltz should.
 */
const BASS_BARS: ReadonlyArray<readonly [number, readonly number[], number]> = [
  [C3, [E3, G3], 1],   // C      — "birth-day to"
  [G2, [B3, D4], 4],   // G7     — "you"
  [G2, [B3, D4], 7],   // G7     — "birth-day to"
  [C3, [E3, G3], 10],  // C      — "you"
  [C3, [E3, G3], 13],  // C      — "birth-day dear"
  [F3, [A3, C4], 16],  // F      — "friend"
  [G2, [B3, F4], 19],  // G7     — "birth-day to"
  [C3, [E3, G3], 22],  // C      — "you"
];

/**
 * Turnaround twinkle: a quick ascending sparkle inside the final bar,
 * finishing right before the next pass's pickup — a flourish that leads
 * back into the loop instead of a tail hanging in dead air.
 */
const SPARKLE: ReadonlyArray<readonly [number, number]> = [
  [E5, 22.5], [G5, 23], [C6, 23.5],
];

/** Pickup-to-pickup: exactly 8 bars of 3/4. The loop is gapless. */
const PASS_BEATS = MELODY_BEATS;
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
  /** Playback has been scheduled — guards against double-starting. */
  began: boolean;
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

/**
 * Glockenspiel chime doubling the melody an octave up — the cute "game
 * noise". A sine fundamental with a fast-decaying inharmonic partial
 * (bell-like ×2.76 overtone), ringing past the staccato lead like a tiny
 * music box mallet. Routed through the lead bus so the echo catches it.
 */
function scheduleChime(s: JingleSession, freq: number, start: number): void {
  const { ac, leadBus } = s;
  const ring = 0.55;

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(0.3, start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + ring);
  gain.connect(leadBus);

  const fundamental = ac.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.setValueAtTime(freq * 2, start);
  fundamental.connect(gain);
  fundamental.start(start);
  fundamental.stop(start + ring + 0.03);

  // Bell partial: inharmonic overtone that decays much faster than the
  // fundamental — this is what makes it read as "chime" instead of "beep".
  const partialGain = ac.createGain();
  partialGain.gain.setValueAtTime(0.0001, start);
  partialGain.gain.linearRampToValueAtTime(0.12, start + 0.003);
  partialGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
  partialGain.connect(leadBus);

  const partial = ac.createOscillator();
  partial.type = 'sine';
  partial.frequency.setValueAtTime(freq * 2 * 2.76, start);
  partial.connect(partialGain);
  partial.start(start);
  partial.stop(start + 0.15);

  s.nodes.push(gain, fundamental, partialGain, partial);
  cleanupOnEnd(fundamental, [fundamental, gain, partial, partialGain]);
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

  // Lead melody, doubled by the glockenspiel chime an octave up.
  let beat = 0;
  for (const [freq, beats] of MELODY) {
    scheduleLead(s, freq, at(beat), beats);
    scheduleChime(s, freq, at(beat));
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
      began: false,
      stopped: false,
    };
    session = s;

    // Begin playback exactly once, tearing down any pending gesture
    // listeners. Both the async resume() success path and the gesture
    // path funnel through here.
    const tryBegin = () => {
      if (s.began || s.stopped || ac.state !== 'running') return;
      s.began = true;
      s.gestureCleanup?.();
      beginPlayback(s);
    };

    if (ac.state === 'suspended') {
      // Also arm gesture listeners in case resume() is rejected until the
      // user actually interacts with the page.
      const onGesture = () => {
        void ac.resume().then(tryBegin).catch(() => {});
      };
      const cleanup = () => {
        window.removeEventListener('pointerdown', onGesture);
        window.removeEventListener('keydown', onGesture);
        s.gestureCleanup = null;
      };
      window.addEventListener('pointerdown', onGesture);
      window.addEventListener('keydown', onGesture);
      s.gestureCleanup = cleanup;

      // Try to resume right away — this succeeds when a gesture already
      // unlocked audio for the page (e.g. the click that navigated here),
      // and MUST start playback on success: resolving without starting was
      // why the jingle sometimes never played at all.
      void ac.resume().then(tryBegin).catch(() => {});
    } else {
      tryBegin();
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
