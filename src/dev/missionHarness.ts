import { isLocalhostDev } from '@/dev/isLocalhostDev';
import {
  createInitialGuideState,
  type PostOnboardingGuideState,
  type PostOnboardingPathId,
} from '@/lib/postOnboardingGuide';

/**
 * Localhost-only harness for inspecting every arrival and mission state.
 *
 * Before this existed, seeing any authenticated mission state required
 * completing a real signup and publishing a kind 30078 to public relays — so
 * the only way to look at the UI was to mutate a real account. That is a poor
 * trade for a screenshot, and it made the visual states effectively unreviewable.
 *
 * Drive a state by appending `?missionDev=<state>` on localhost, e.g.
 * `/?missionDev=intro` or `/missions?missionDev=ready`. Reduced-motion variants
 * come from the OS/browser setting; desktop vs. mobile from the viewport.
 *
 * Arrival scenarios, all replayable by reloading:
 *  - `arrival`          — the whole sequence from the first beat.
 *  - `arrival-card`     — starts at the Explorer card, skipping the welcome, for
 *                         iterating on the card itself without waiting.
 *  - `arrival-handoff`  — starts at the travel, for iterating on the part that
 *                         is hardest to catch: whether the card genuinely lands
 *                         on its destination.
 *
 * This is a permanent development tool for this experience, not a demo.
 *
 * ### Isolation
 *
 * Three layers keep this away from production. `import.meta.env.DEV` is
 * statically false in a production build so the bundler drops these branches;
 * {@link isLocalhostDev} additionally requires a localhost hostname; and every
 * export here returns `undefined`/`false` when the gate fails, so a caller that
 * forgets to check still gets production behaviour.
 *
 * It carries **no policy**. It substitutes a state object for reading and
 * swallows writes; it never decides eligibility, never completes a task, and
 * never publishes anything. `MissionEngine` remains the only policy owner.
 */

export type MissionDevState =
  | 'arrival'
  | 'arrival-card'
  | 'arrival-handoff'
  | 'intro'
  | 'intro-postponed'
  | 'active0'
  | 'active1'
  | 'active2'
  | 'active3'
  | 'hidden'
  | 'ready'
  | 'claiming'
  | 'claimed'
  | 'failed';

const ALL_TASKS: PostOnboardingPathId[] = [
  'find-people',
  'post-small',
  'customize',
  'explore',
];

/** The requested harness state, or `undefined` when the harness is inactive. */
export function missionDevState(): MissionDevState | undefined {
  if (!isLocalhostDev()) return undefined;
  if (typeof window === 'undefined') return undefined;
  const value = new URLSearchParams(window.location.search).get('missionDev');
  return value ? (value as MissionDevState) : undefined;
}

/**
 * Whether the harness is driving this page load.
 *
 * The mission surfaces normally require a logged-in user. On localhost the
 * harness stands in for one so the visuals can be inspected without signing up
 * — which is the whole point, since signing up publishes real events.
 */
export function missionDevActive(): boolean {
  return missionDevState() !== undefined;
}

/** Arrival scenarios, and the beat each one starts on. */
const ARRIVAL_ENTRY: Partial<Record<MissionDevState, 'sequence' | 'card' | 'handoff'>> = {
  arrival: 'sequence',
  'arrival-card': 'card',
  'arrival-handoff': 'handoff',
};

/**
 * Which beat the harness should force the arrival to start on, or `undefined`
 * when it should not run at all.
 *
 * Starting mid-sequence exists because the handoff is the part worth iterating
 * on and the part you otherwise have to sit through three seconds to see.
 */
export function missionDevArrivalEntry(): 'sequence' | 'card' | 'handoff' | undefined {
  const scenario = missionDevState();
  return scenario ? ARRIVAL_ENTRY[scenario] : undefined;
}

/** Whether the harness should force the arrival transition to play. */
export function missionDevForcesArrival(): boolean {
  return missionDevArrivalEntry() !== undefined;
}

// ── Shared harness store ────────────────────────────────────────────────────
//
// `usePostOnboardingGuide` is called from several components at once. In
// production they all read the same encrypted-settings query cache, so a
// transition made in one is seen by all. The harness has to reproduce that or
// it misleads: clicking "Start exploring" in the introduction would update only
// that component's copy while the page around it still showed the intro.
//
// Module scope is acceptable here precisely because this file is dev-only and
// carries no policy — it is a substitute data source, nothing more.

let harnessState: PostOnboardingGuideState | undefined;
let harnessInitialised = false;
const harnessListeners = new Set<() => void>();

/** Current harness state, or `undefined` when the harness is inactive. */
export function readMissionDevState(): PostOnboardingGuideState | undefined {
  if (!missionDevState()) return undefined;
  if (!harnessInitialised) {
    harnessInitialised = true;
    harnessState = buildMissionDevState();
  }
  return harnessState;
}

/** Apply a transition to the shared harness state and notify every reader. */
export function writeMissionDevState(next: PostOnboardingGuideState): void {
  harnessState = next;
  for (const listener of harnessListeners) listener();
}

export function subscribeMissionDev(listener: () => void): () => void {
  harnessListeners.add(listener);
  return () => harnessListeners.delete(listener);
}

/**
 * A synthetic mission state for the requested scenario, or `undefined` when the
 * harness is inactive. Timestamps are relative to now so freshness-based rules
 * (stale claims, clock skew) behave realistically.
 */
function buildMissionDevState(): PostOnboardingGuideState | undefined {
  const scenario = missionDevState();
  if (!scenario) return undefined;

  const now = Date.now();
  const state = createInitialGuideState(now - 60_000);
  const complete = (count: number) => {
    for (const id of ALL_TASKS.slice(0, count)) state.paths[id] = 'completed';
  };
  // Most scenarios describe life *after* the introduction; the intro-specific
  // ones override this below.
  const acknowledged = { ...state.intro, acknowledgedAt: now - 30_000 };

  switch (scenario) {
    case 'arrival':
    case 'arrival-card':
    case 'arrival-handoff':
    case 'intro':
      return state; // freshly created: intro pending
    case 'intro-postponed':
      return { ...state, intro: { ...state.intro, postponedAt: now - 10_000 } };
    case 'active0':
      return { ...state, intro: acknowledged };
    case 'active1':
      complete(1);
      return { ...state, intro: acknowledged, activePath: 'post-small' };
    case 'active2':
      complete(2);
      return { ...state, intro: acknowledged, activePath: 'customize' };
    case 'active3':
      complete(3);
      return { ...state, intro: acknowledged };
    case 'hidden':
      complete(2);
      return { ...state, intro: acknowledged, status: 'skipped', skippedAt: now - 5_000 };
    case 'ready':
      complete(4);
      return { ...state, intro: acknowledged, status: 'completed', completedAt: now - 5_000 };
    case 'claiming':
      complete(4);
      return {
        ...state,
        intro: acknowledged,
        status: 'completed',
        completedAt: now - 5_000,
        badgeClaim: { badge: 'ditto-explorer', status: 'claiming', claimingStartedAt: now },
      };
    case 'claimed':
      complete(4);
      return {
        ...state,
        intro: acknowledged,
        status: 'completed',
        completedAt: now - 5_000,
        badgeClaim: {
          badge: 'ditto-explorer',
          status: 'claimed',
          claimEventId: 'f'.repeat(64),
          claimedAt: now - 1_000,
        },
      };
    case 'failed':
      complete(4);
      return {
        ...state,
        intro: acknowledged,
        status: 'completed',
        completedAt: now - 5_000,
        badgeClaim: { badge: 'ditto-explorer', status: 'failed', failedAt: now - 1_000 },
      };
    default:
      return state;
  }
}
