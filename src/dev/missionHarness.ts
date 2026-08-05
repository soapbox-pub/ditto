import { isLocalhostDev } from '@/dev/isLocalhostDev';
import type { ArrivalStageEntry } from '@/hooks/useArrivalStage';
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
 * Arrival scenarios, all replayable by reloading. Each starts *directly* on the
 * named act rather than approximating it with a delayed timer, then continues
 * from there:
 *  - `arrival`              — the whole sequence from the first beat.
 *  - `arrival-welcome`      — the welcome, held.
 *  - `arrival-presentation` — the Explorer heading and card, held.
 *  - `arrival-reveal`       — the backdrop dissolving over the application.
 *  - `arrival-handoff`      — the travel, the part hardest to catch by hand.
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
  | 'arrival-welcome'
  | 'arrival-presentation'
  | 'arrival-reveal'
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

/** Arrival scenarios, and the act each one starts on. */
const ARRIVAL_ENTRY: Partial<Record<MissionDevState, ArrivalStageEntry | 'sequence'>> = {
  arrival: 'sequence',
  'arrival-welcome': 'welcome',
  'arrival-presentation': 'presenting',
  'arrival-reveal': 'revealing',
  'arrival-handoff': 'handoff',
};

/**
 * Which act the harness should start the arrival on, or `undefined` for the
 * full sequence (and for every non-arrival scenario).
 *
 * Entering mid-sequence exists because the interesting frames — the handoff,
 * the backdrop mid-fade — are a few hundred milliseconds long and otherwise
 * cost several seconds of waiting per attempt to reach.
 */
export function missionDevArrivalEntry(): ArrivalStageEntry | undefined {
  const scenario = missionDevState();
  const entry = scenario ? ARRIVAL_ENTRY[scenario] : undefined;
  return entry && entry !== 'sequence' ? entry : undefined;
}

/**
 * Whether the harness should force the arrival to play at all — true for every
 * `arrival*` scenario, including the full sequence, which has no entry act.
 */
export function missionDevForcesArrival(): boolean {
  const scenario = missionDevState();
  return scenario !== undefined && ARRIVAL_ENTRY[scenario] !== undefined;
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
    case 'arrival-welcome':
    case 'arrival-presentation':
    case 'arrival-reveal':
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
