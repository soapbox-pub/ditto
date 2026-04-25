/**
 * Tiny cute "digital nom" sound for Blobbi feeding feedback.
 *
 * This intentionally avoids realistic chewing. Real procedural chewing tends
 * to sound wet, crunchy, static-like, or creepy. Blobbi is a fully virtual
 * Nostr creature, so this sound is more like a tiny synthetic "nom~" reward:
 *
 *   1. soft initial food-pop
 *   2. short cute upward/downward digital hum
 *   3. tiny second pop, like a happy "nhom"
 *
 * No audio files, no fetch, no dependencies.
 */

const MASTER_GAIN = 0.105;

/**
 * Short toy-like pops.
 * These provide the "bite/nom" feeling without using noise.
 */
const POPS: ReadonlyArray<{
  offsetMs: number;
  durationMs: number;
  startHz: number;
  endHz: number;
  gain: number;
}> = [
  {
    offsetMs: 0,
    durationMs: 78,
    startHz: 500,
    endHz: 360,
    gain: 0.065,
  },
  {
    offsetMs: 118,
    durationMs: 62,
    startHz: 620,
    endHz: 470,
    gain: 0.04,
  },
];

/**
 * A very short synthetic "mmm~" layer.
 * Higher than a human voice so it feels like Blobbi, not a person.
 */
const HUM = {
  offsetMs: 36,
  durationMs: 155,
  startHz: 740,
  midHz: 860,
  endHz: 690,
  gain: 0.032,
};

const TOTAL_DURATION_SEC = 0.24;

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

function schedulePop(
  ac: AudioContext,
  destination: AudioNode,
  now: number,
  pop: {
    offsetMs: number;
    durationMs: number;
    startHz: number;
    endHz: number;
    gain: number;
  },
): AudioNode[] {
  const start = now + pop.offsetMs / 1000;
  const end = start + pop.durationMs / 1000;
  const attack = 0.007;
  const releaseStart = start + (pop.durationMs / 1000) * 0.34;

  const osc = ac.createOscillator();
  osc.type = 'sine';

  // Downward slide = soft pop, not a UI beep.
  osc.frequency.setValueAtTime(pop.startHz, start);
  osc.frequency.exponentialRampToValueAtTime(pop.endHz, end);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(pop.gain, start + attack);
  gain.gain.setValueAtTime(pop.gain, releaseStart);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(start);
  osc.stop(end);

  return [osc, gain];
}

function scheduleCuteHum(
  ac: AudioContext,
  destination: AudioNode,
  now: number,
): AudioNode[] {
  const start = now + HUM.offsetMs / 1000;
  const end = start + HUM.durationMs / 1000;
  const mid = start + HUM.durationMs / 1000 * 0.42;

  const osc = ac.createOscillator();
  osc.type = 'triangle';

  // Tiny expressive pitch motion: "nyum~"
  osc.frequency.setValueAtTime(HUM.startHz, start);
  osc.frequency.exponentialRampToValueAtTime(HUM.midHz, mid);
  osc.frequency.exponentialRampToValueAtTime(HUM.endHz, end);

  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(HUM.gain, start + 0.025);
  gain.gain.setValueAtTime(HUM.gain, start + 0.085);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain);
  gain.connect(destination);

  osc.start(start);
  osc.stop(end);

  return [osc, gain];
}

/**
 * Play a tiny cute feeding reward sound.
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

    // Warm the whole sound so it feels round and soft.
    const lowpass = ac.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1650, now);
    lowpass.Q.setValueAtTime(0.55, now);

    // Small stereo-ish depth using a delay that is nearly imperceptible.
    // This makes it feel less like a raw oscillator and more like a tiny
    // virtual creature sound.
    const delay = ac.createDelay();
    delay.delayTime.setValueAtTime(0.018, now);

    const dryGain = ac.createGain();
    dryGain.gain.setValueAtTime(0.88, now);

    const wetGain = ac.createGain();
    wetGain.gain.setValueAtTime(0.12, now);

    const master = ac.createGain();
    master.gain.setValueAtTime(MASTER_GAIN, now);
    master.gain.setValueAtTime(MASTER_GAIN, now + TOTAL_DURATION_SEC * 0.7);
    master.gain.exponentialRampToValueAtTime(0.0001, now + TOTAL_DURATION_SEC);

    lowpass.connect(dryGain);
    lowpass.connect(delay);
    delay.connect(wetGain);

    dryGain.connect(master);
    wetGain.connect(master);
    master.connect(ac.destination);

    const nodes: AudioNode[] = [lowpass, delay, dryGain, wetGain, master];
    let lastOsc: OscillatorNode | null = null;

    for (const pop of POPS) {
      const popNodes = schedulePop(ac, lowpass, now, pop);
      nodes.push(...popNodes);

      const maybeOsc = popNodes[0];
      if (maybeOsc instanceof OscillatorNode) {
        lastOsc = maybeOsc;
      }
    }

    const humNodes = scheduleCuteHum(ac, lowpass, now);
    nodes.push(...humNodes);

    const maybeHumOsc = humNodes[0];
    if (maybeHumOsc instanceof OscillatorNode) {
      lastOsc = maybeHumOsc;
    }

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