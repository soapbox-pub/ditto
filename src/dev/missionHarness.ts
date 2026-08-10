import { isLocalhostDev } from '@/dev/isLocalhostDev';
import type { ArrivalStageEntry } from '@/hooks/useArrivalStage';
import {
  emitPostInteraction,
  type PostInteractionKind,
} from '@/lib/postInteraction';
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
 * Interaction-task scenarios, all on `/feed?missionDev=<state>` with the first
 * three tasks already done, so the fourth is the one in play:
 *  - `interact`            — the task active, with its feed guidance showing.
 *  - `interact-empty-feed` — the same, in its "your feed is quiet" fallback.
 *  - `interact-reaction` / `-reply` / `-repost` / `-bookmark` — a successful
 *    interaction of that kind is **injected as a signal** a moment after load,
 *    driving the real completion path end to end: engine → persistence →
 *    action-specific acknowledgement → completion animation → settled state.
 *  - `interact-own-post`   — an injected interaction with the user's *own*
 *    post, which must complete nothing.
 *  - `interact-write-fails` — the same injection while every mission write is
 *    rejected, for confirming a persistence failure produces no write loop.
 *  - `interact-done`       — the task already completed (settled state).
 *
 * Nothing here publishes. The injected signals are ordinary in-process values
 * of the same shape the real action paths report, and every mission write is
 * absorbed by the harness store below — no signer, no relay, no network.
 *
 * Arrival scenarios, all replayable by reloading. Each starts *directly* on the
 * named act rather than approximating it with a delayed timer, then continues
 * from there:
 *  - `arrival`              — the whole sequence from the first beat.
 *  - `arrival-welcome`      — the welcome entering.
 *  - `arrival-welcome-reading` — the welcome's stable hold, **held**.
 *  - `arrival-presentation` — the Explorer composition entering.
 *  - `arrival-reading`      — the complete settled composition, **held
 *                             indefinitely**: eyebrow, title, the line about the
 *                             4 missions, the full card, and the reassurance
 *                             beneath it. For reviewing spacing, hierarchy and
 *                             glow without a timer taking it away mid-inspection.
 *  - `arrival-copy-out`     — the framing copy and the reassurance leaving, with
 *                            the card alone on a still-opaque backdrop, **held**.
 *  - `arrival-content-transform` — the card mid-wipe, **held**.
 *  - `arrival-compact-ready` — the card in its destination-shaped form, **held**,
 *                             for checking it against the real widget.
 *  - `arrival-reveal`       — the backdrop dissolving over the application.
 *  - `arrival-handoff`      — the travel, the part hardest to catch by hand.
 *
 * This is a permanent development tool for this experience, not a demo.
 *
 * ### Isolation
 *
 * Two layers keep this away from users. {@link isLocalhostDev} is false in
 * every production build and off localhost, and every export here returns
 * `undefined`/`false` when that gate fails — so a caller that forgets to check
 * still gets production behaviour, and `?missionDev=` does nothing on a
 * deployed build.
 *
 * The gate is behavioural rather than a bundling guarantee: this module is
 * imported from production hooks, so its scenario tables are still emitted into
 * the bundle. They are inert there, not absent.
 *
 * It carries **no policy**. It substitutes a state object for reading and
 * swallows writes; it never decides eligibility, never completes a task, and
 * never publishes anything. `MissionEngine` remains the only policy owner.
 */

export type MissionDevState =
  | 'arrival'
  | 'arrival-welcome'
  | 'arrival-welcome-reading'
  | 'arrival-presentation'
  | 'arrival-reading'
  | 'arrival-copy-out'
  | 'arrival-reveal'
  | 'arrival-content-transform'
  | 'arrival-compact-ready'
  | 'arrival-handoff'
  | 'intro'
  | 'intro-postponed'
  | 'active0'
  | 'active1'
  | 'active2'
  | 'active3'
  | 'interact'
  | 'interact-empty-feed'
  | 'interact-reaction'
  | 'interact-reply'
  | 'interact-repost'
  | 'interact-bookmark'
  | 'interact-own-post'
  | 'interact-write-fails'
  | 'interact-done'
  | 'hidden'
  | 'ready'
  | 'claiming'
  | 'claimed'
  | 'failed';

const ALL_TASKS: PostOnboardingPathId[] = [
  'find-people',
  'post-small',
  'customize',
  'interact',
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
  'arrival-welcome-reading': 'welcome-reading',
  'arrival-presentation': 'presenting',
  'arrival-reading': 'reading',
  'arrival-copy-out': 'copy-out',
  'arrival-reveal': 'revealing',
  'arrival-content-transform': 'content-out',
  'arrival-compact-ready': 'content-in',
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
 * Whether the harness should hold the sequence on its entry act instead of
 * letting the lifecycle advance. Only `arrival-reading` does — it exists so the
 * settled frame can be inspected for as long as it takes.
 */
const HELD_ARRIVAL_STATES = new Set<MissionDevState>([
  'arrival-welcome-reading',
  'arrival-reading',
  'arrival-copy-out',
  'arrival-content-transform',
  'arrival-compact-ready',
]);

export function missionDevHoldsArrival(): boolean {
  const scenario = missionDevState();
  return scenario !== undefined && HELD_ARRIVAL_STATES.has(scenario);
}

/**
 * Whether the harness should force the arrival to play at all — true for every
 * `arrival*` scenario, including the full sequence, which has no entry act.
 */
export function missionDevForcesArrival(): boolean {
  const scenario = missionDevState();
  return scenario !== undefined && ARRIVAL_ENTRY[scenario] !== undefined;
}

// ── Interaction-task scenarios ──────────────────────────────────────────────

/** Which interaction each injecting scenario stands in for. */
const INJECTED_INTERACTION: Partial<Record<MissionDevState, PostInteractionKind>> = {
  'interact-reaction': 'reaction',
  'interact-reply': 'reply',
  'interact-repost': 'repost',
  'interact-bookmark': 'bookmark',
  'interact-own-post': 'reaction',
  'interact-write-fails': 'reaction',
};

/** A stable stand-in for "some other person's post". */
const HARNESS_TARGET_EVENT_ID = 'e'.repeat(64);
const HARNESS_OTHER_AUTHOR = 'd'.repeat(64);

/**
 * Delay before the injected interaction lands. Long enough to see the guided
 * state first, short enough not to make each attempt a wait.
 *
 * Overridable with `&missionDevDelay=<ms>`, for the same reason the arrival
 * scenarios can be entered mid-sequence: the celebration is a ~2.4s window that
 * is otherwise easy to miss, and pushing the injection out is cheaper than
 * reloading until the timing happens to line up.
 */
const INJECTION_DELAY_MS = 2_500;

function injectionDelay(): number {
  if (typeof window === 'undefined') return INJECTION_DELAY_MS;
  const raw = new URLSearchParams(window.location.search).get('missionDevDelay');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : INJECTION_DELAY_MS;
}

/**
 * Whether the guidance tip should present its empty-feed fallback regardless of
 * who the user follows. Feed emptiness depends on relays, which the harness
 * cannot fake — this makes the fallback inspectable anyway.
 */
export function missionDevForcesEmptyFeed(): boolean {
  return missionDevState() === 'interact-empty-feed';
}

/**
 * Whether the harness should reject every mission write, standing in for a
 * persistence failure. The completion is then detected but never persists,
 * which is the situation a write loop would be born from.
 */
export function missionDevRejectsWrites(): boolean {
  return missionDevState() === 'interact-write-fails';
}

/** Stand-in actor for the signed-out harness. Never signs or publishes. */
const HARNESS_ACTOR = 'a'.repeat(64);

/**
 * Arm the scenario's injected interaction, returning a cleanup.
 *
 * A no-op unless a `?missionDev=interact-*` scenario asked for one. The signal
 * is emitted exactly as the real action paths emit theirs, so the engine's
 * ownership rule, idempotence and completion all run for real — the only thing
 * missing is the network.
 *
 * Signed out, the engine's detection is (correctly) off, since real completion
 * must never happen without a resolved identity. Rather than make the harness
 * useless in the case it exists for — inspecting mission visuals *without*
 * signing up, which publishes real events — it then applies the completion to
 * its own store directly. That is a substituted outcome, not a bypassed rule:
 * the harness carries no policy either way.
 *
 * `interact-own-post` names the actor as the target author, which must complete
 * nothing, so it is never substituted.
 */
export function armMissionDevInteraction(pubkey: string | undefined): (() => void) | undefined {
  const scenario = missionDevState();
  if (!scenario) return undefined;
  const action = INJECTED_INTERACTION[scenario];
  if (!action) return undefined;

  const actor = pubkey ?? HARNESS_ACTOR;
  const ownPost = scenario === 'interact-own-post';

  const timer = setTimeout(() => {
    emitPostInteraction({
      type: action,
      actorPubkey: actor,
      targetEventId: HARNESS_TARGET_EVENT_ID,
      targetAuthorPubkey: ownPost ? actor : HARNESS_OTHER_AUTHOR,
    });

    // Signed out: no engine detection to pick the signal up, so stand in for
    // the transition it would have made. Never for the own-post scenario, which
    // must complete nothing.
    if (pubkey || ownPost) return;

    // Persistence-failure scenario: the completion is detected and the write is
    // attempted exactly once, then rejected. Nothing retries it, which is the
    // property worth being able to watch.
    if (missionDevRejectsWrites()) {
      console.error('Mission harness: simulated persistence failure');
      return;
    }

    const current = readMissionDevState();
    if (!current || current.status !== 'active') return;
    if (current.paths.interact === 'completed') return;

    const now = Date.now();
    const paths = { ...current.paths, interact: 'completed' as const };
    const allDone = ALL_TASKS.every((id) => paths[id] === 'completed');
    writeMissionDevState({
      ...current,
      paths,
      interact: { action, targetEventId: HARNESS_TARGET_EVENT_ID, completedAt: now },
      status: allDone ? 'completed' : 'active',
      completedAt: allDone ? now : current.completedAt,
      updatedAt: now,
    });
  }, injectionDelay());

  return () => clearTimeout(timer);
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
    case 'arrival-copy-out':
    case 'arrival-welcome-reading':
    case 'arrival-presentation':
    case 'arrival-reading':
    case 'arrival-reveal':
    case 'arrival-content-transform':
    case 'arrival-compact-ready':
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
    case 'interact':
    case 'interact-empty-feed':
    case 'interact-reaction':
    case 'interact-reply':
    case 'interact-repost':
    case 'interact-bookmark':
    case 'interact-own-post':
    case 'interact-write-fails':
      complete(3);
      return { ...state, intro: acknowledged, activePath: 'interact' };
    case 'interact-done':
      complete(4);
      return {
        ...state,
        intro: acknowledged,
        status: 'completed',
        completedAt: now - 5_000,
        interact: { action: 'bookmark', targetEventId: 'b'.repeat(64), completedAt: now - 5_000 },
      };
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
