/**
 * Cute synchronized "nom nom nom" sound for Blobbi feeding feedback.
 *
 * The audio rhythm is locked to the chewing mouth SMIL animation
 * ({@link CHEW_CYCLE_SEC} from mouth/generators.ts).  Each 300 ms visual
 * chomp cycle gets two sound layers:
 *
 *   1. **Open pop** (t = 0 of cycle) — mouth opens → short bright "nom"
 *   2. **Close smack** (t ≈ 140 ms)  — mouth closes → softer lower "mm"
 *
 * Four cycles play over the 1 200 ms chewing window, with progressive
 * volume decay so later chews feel like echoes of the first bite.
 *
 * No audio files, no fetch, no dependencies.
 */

import { CHEW_CYCLE_SEC } from '@/blobbi/ui/lib/mouth';

// ─── Tuning constants ─────────────────────────────────────────────────────────

const MASTER_GAIN = 0.38;

/**
 * Number of chomp cycles to play.
 * 4 × 300 ms = 1 200 ms, matching the visual CHEW_DURATION_MS.
 */
const CHEW_CYCLES = 4;

/**
 * Per-cycle gain multipliers.  First nom is strongest; later noms decay
 * so the sound feels like one chewing sequence, not separate beeps.
 */
const CYCLE_GAINS: readonly number[] = [1.0, 0.7, 0.52, 0.38];

// ─── Open pop: bright short "nom" when the mouth opens ────────────────────────

const OPEN_POP = {
  /** Offset within the cycle (ms) — 0 = mouth just opened. */
  offsetMs: 0,
  durationMs: 72,
  startHz: 520,
  endHz: 370,
  gain: 0.13,
};

// ─── Close smack: softer lower "mm" when the mouth closes ─────────────────────

const CLOSE_SMACK = {
  /** Offset within the cycle (ms) — ~half the cycle, mouth is closing. */
  offsetMs: 140,
  durationMs: 55,
  startHz: 400,
  endHz: 310,
  gain: 0.065,
};

// ─── Hum layer: tiny "nyum~" bridging the open and close ──────────────────────

const HUM = {
  offsetMs: 30,
  durationMs: 130,
  startHz: 740,
  midHz: 840,
  endHz: 680,
  gain: 0.055,
};

/** Total sound duration in seconds (last cycle start + one full cycle + tail). */
const TOTAL_DURATION_SEC =
  (CHEW_CYCLES - 1) * CHEW_CYCLE_SEC + CHEW_CYCLE_SEC + 0.04;

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

// ─── Schedulers ───────────────────────────────────────────────────────────────

/** Schedule a short sine pop (open or close). */
function schedulePop(
  ac: AudioContext,
  destination: AudioNode,
  cycleStart: number,
  pop: {
    offsetMs: number;
    durationMs: number;
    startHz: number;
    endHz: number;
    gain: number;
  },
  cycleGain: number,
): AudioNode[] {
  const start = cycleStart + pop.offsetMs / 1000;
  const end = start + pop.durationMs / 1000;
  const attack = 0.006;
  const releaseStart = start + (pop.durationMs / 1000) * 0.35;

  const osc = ac.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(pop.startHz, start);
  osc.frequency.exponentialRampToValueAtTime(pop.endHz, end);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(pop.gain * cycleGain, start + attack);
  gain.gain.setValueAtTime(pop.gain * cycleGain, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(end);

  return [osc, gain];
}

/** Schedule the short triangle "mmm~" hum that bridges open→close. */
function scheduleHum(
  ac: AudioContext,
  destination: AudioNode,
  cycleStart: number,
  cycleGain: number,
): AudioNode[] {
  const start = cycleStart + HUM.offsetMs / 1000;
  const end = start + HUM.durationMs / 1000;
  const mid = start + (HUM.durationMs / 1000) * 0.42;

  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(HUM.startHz, start);
  osc.frequency.exponentialRampToValueAtTime(HUM.midHz, mid);
  osc.frequency.exponentialRampToValueAtTime(HUM.endHz, end);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(HUM.gain * cycleGain, start + 0.02);
  gain.gain.setValueAtTime(HUM.gain * cycleGain, start + 0.07);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(destination);
  osc.start(start);
  osc.stop(end);

  return [osc, gain];
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Play the feeding sound synchronized to the chewing mouth animation.
 *
 * Schedules {@link CHEW_CYCLES} audio cycles, each aligned to one SMIL
 * chomp period ({@link CHEW_CYCLE_SEC}).  Per cycle:
 *   - t = 0 ms   → open pop  (mouth opens)
 *   - t = 30 ms  → hum layer (bridging "nyum~")
 *   - t = 140 ms → close smack (mouth closes)
 *
 * Fire-and-forget. Errors are swallowed so feeding is never blocked.
 */
export function playMunchSound(): void {
  try {
    const ac = getContext();
    if (!ac) return;

    if (ac.state === 'suspended') {
      void ac.resume().catch(() => {});
    }

    const now = ac.currentTime;

    // ── Signal chain: sources → lowpass → dry/wet → master → output ──

    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1900, now);
    lowpass.Q.setValueAtTime(0.55, now);

    // Micro-delay for stereo-ish depth.
    const delay = ac.createDelay();
    delay.delayTime.setValueAtTime(0.018, now);

    const dryGain = ac.createGain();
    dryGain.gain.setValueAtTime(0.88, now);

    const wetGain = ac.createGain();
    wetGain.gain.setValueAtTime(0.12, now);

    const master = ac.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, now);
    master.gain.setValueAtTime(MASTER_GAIN, now + TOTAL_DURATION_SEC * 0.82);
    master.gain.exponentialRampToValueAtTime(0.0001, now + TOTAL_DURATION_SEC);

    lowpass.connect(dryGain);
    lowpass.connect(delay);
    delay.connect(wetGain);

    dryGain.connect(master);
    wetGain.connect(master);
    master.connect(ac.destination);

    const nodes: AudioNode[] = [lowpass, delay, dryGain, wetGain, master];
    let lastOsc: OscillatorNode | null = null;

    // ── Schedule audio per chew cycle, aligned to SMIL timing ──
    //
    // The first open-pop fires at exactly `now` (i=0, OPEN_POP.offsetMs=0)
    // so the "nom" is heard the instant the chewing mouth appears.
    //
    // If the sound still feels late after testing, the fix is to call
    // playMunchSound() earlier in BlobbiPage (before setActionOverrideEmotion),
    // not to add a positive delay here.

    for (let i = 0; i < CHEW_CYCLES; i++) {
      const cycleStart = now + i * CHEW_CYCLE_SEC;
      const cg = CYCLE_GAINS[i] ?? CYCLE_GAINS[CYCLE_GAINS.length - 1];

      // Open pop — mouth opens at cycle start
      const openNodes = schedulePop(ac, lowpass, cycleStart, OPEN_POP, cg);
      nodes.push(...openNodes);
      if (openNodes[0] instanceof OscillatorNode) lastOsc = openNodes[0];

      // Hum bridge — "nyum~" between open and close
      const humNodes = scheduleHum(ac, lowpass, cycleStart, cg);
      nodes.push(...humNodes);
      if (humNodes[0] instanceof OscillatorNode) lastOsc = humNodes[0];

      // Close smack — mouth closes at ~half cycle
      const closeNodes = schedulePop(ac, lowpass, cycleStart, CLOSE_SMACK, cg);
      nodes.push(...closeNodes);
      if (closeNodes[0] instanceof OscillatorNode) lastOsc = closeNodes[0];
    }

    // ── Cleanup all nodes when the last oscillator ends ──

    if (lastOsc) {
      lastOsc.onended = () => {
        try {
          for (const node of nodes) {
            node.disconnect();
          }
        } catch {
          // Already disconnected.
        }
      };
    }
  } catch {
    // Never let audio errors affect feeding.
  }
}
