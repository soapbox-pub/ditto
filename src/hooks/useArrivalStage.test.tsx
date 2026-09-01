import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  MIN_READING_HOLD_MS,
  MIN_WELCOME_HOLD_MS,
  REDUCED_STAGE_TIMINGS,
  REDUCED_WELCOME_ENTERED_AT_MS,
  STAGE_TIMINGS,
  WELCOME_ENTERED_AT_MS,
  isCardTransforming,
  isCompactCardContentVisible,
  isFullCardContentVisible,
  isGap,
  isIntroCopyVisible,
  isPresentationStage,
  isCopyExiting,
  isReadingBeat,
  isReassuranceVisible,
  isWelcomeHold,
  isWelcomeStage,
  useArrivalStage,
  type ArrivalStage,
} from './useArrivalStage';
import { ARRIVAL_TIMINGS, type ArrivalPhase } from './useFirstArrivalExperience';

const ALL_STAGES: ArrivalStage[] = [
  'signal', 'welcome', 'welcome-out', 'gap', 'presenting', 'reading',
  'copy-out', 'revealing', 'content-out', 'content-in', 'travelling', 'done',
];

function renderStage(phase: ArrivalPhase, reducedMotion = false) {
  return renderHook(
    ({ phase, reducedMotion }: { phase: ArrivalPhase; reducedMotion: boolean }) =>
      useArrivalStage({ phase, reducedMotion }),
    { initialProps: { phase, reducedMotion } },
  );
}

describe('useArrivalStage — act progression', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('opens on the signal, with no copy yet', () => {
    const { result } = renderStage('playing');
    expect(result.current).toBe('signal');
    expect(isWelcomeStage('signal')).toBe(true);
    expect(isPresentationStage('signal')).toBe(false);
  });

  it('runs welcome, welcome-out and presenting as three distinct acts', () => {
    const { result } = renderStage('playing');
    const seen: ArrivalStage[] = [result.current];

    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.signal));
    seen.push(result.current);
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcome - STAGE_TIMINGS.signal));
    seen.push(result.current);
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcomeOut - STAGE_TIMINGS.welcome));
    seen.push(result.current);
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.gap - STAGE_TIMINGS.welcomeOut));
    seen.push(result.current);

    expect(seen).toEqual(['signal', 'welcome', 'welcome-out', 'gap', 'presenting']);
  });

  it('holds the welcome still long enough to read it', () => {
    // Measured at 553ms before this pass — a window, but a rushed one. The
    // entrance itself does not count: the hold runs from when the text stops
    // moving.
    const hold = STAGE_TIMINGS.welcome - WELCOME_ENTERED_AT_MS;
    expect(hold).toBeGreaterThanOrEqual(MIN_WELCOME_HOLD_MS);
  });

  it('mounts no Explorer content during the welcome hold', () => {
    expect(isPresentationStage('welcome')).toBe(false);
    expect(isIntroCopyVisible('welcome')).toBe(false);
  });

  it('puts a clean gap between the two chapters', () => {
    // Nothing readable is mounted at all — punctuation, by construction rather
    // than by both layers happening to be transparent.
    expect(isWelcomeStage('gap')).toBe(false);
    expect(isPresentationStage('gap')).toBe(false);
    expect(isGap('gap')).toBe(true);

    const pause = STAGE_TIMINGS.gap - STAGE_TIMINGS.welcomeOut;
    expect(pause).toBeGreaterThanOrEqual(200);
    expect(pause).toBeLessThanOrEqual(300);
  });

  it('gives the welcome a deliberate exit of its own', () => {
    const exit = STAGE_TIMINGS.welcomeOut - STAGE_TIMINGS.welcome;
    expect(exit).toBeGreaterThanOrEqual(400);
    expect(exit).toBeLessThanOrEqual(550);
  });

  it('never reports welcome and presentation at the same time', () => {
    // The layers are mounted from these predicates, so a stage that satisfied
    // both would put two pieces of copy on screen at once.
    for (const stage of ALL_STAGES) {
      expect(isWelcomeStage(stage) && isPresentationStage(stage)).toBe(false);
    }
  });

  it('does not show the Explorer heading while the welcome is active', () => {
    for (const stage of ['signal', 'welcome', 'welcome-out'] as ArrivalStage[]) {
      expect(isIntroCopyVisible(stage)).toBe(false);
    }
  });

  it('leaves the welcome before the presentation enters', () => {
    const { result } = renderStage('playing');
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.welcome));
    // An exit act of its own: the welcome is on its way out and nothing has
    // started entering.
    expect(result.current).toBe('welcome-out');
    expect(isWelcomeStage(result.current)).toBe(true);
    expect(isPresentationStage(result.current)).toBe(false);
  });
});

describe('useArrivalStage — reveal and handoff', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('transforms the card contents before the travel begins', () => {
    const { result, rerender } = renderStage('playing');
    rerender({ phase: 'revealing', reducedMotion: false });
    expect(result.current).toBe('revealing');

    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.contentOutAfterReveal));
    expect(result.current).toBe('content-out');
    act(() =>
      void vi.advanceTimersByTime(
        STAGE_TIMINGS.contentInAfterReveal - STAGE_TIMINGS.contentOutAfterReveal,
      ),
    );
    expect(result.current).toBe('content-in');
  });

  it('empties the card before it refills, never both at once', () => {
    expect(isFullCardContentVisible('content-out')).toBe(false);
    expect(isCompactCardContentVisible('content-out')).toBe(false);
    expect(isCompactCardContentVisible('content-in')).toBe(true);
    expect(isFullCardContentVisible('content-in')).toBe(false);
  });

  it('leaves only the shell between the two content groups', () => {
    expect(isCardTransforming('content-out')).toBe(true);
    expect(isCardTransforming('content-in')).toBe(true);
    expect(isCardTransforming('reading')).toBe(false);
  });

  it('keeps the card mounted throughout the transformation', () => {
    for (const stage of ['content-out', 'content-in', 'travelling'] as ArrivalStage[]) {
      expect(isPresentationStage(stage)).toBe(true);
    }
  });

  it('carries only compact content into the travel', () => {
    expect(isFullCardContentVisible('travelling')).toBe(false);
    expect(isCompactCardContentVisible('travelling')).toBe(true);
  });

  it('removes the framing copy before the card moves', () => {
    // It belongs to the central stage only and must never travel.
    expect(isIntroCopyVisible('content-out')).toBe(false);
    expect(isIntroCopyVisible('content-in')).toBe(false);
    expect(isIntroCopyVisible('travelling')).toBe(false);
  });

  it('shows nothing once the sequence is over', () => {
    const { result } = renderStage('done');
    expect(result.current).toBe('done');
    expect(isWelcomeStage('done')).toBe(false);
    expect(isPresentationStage('done')).toBe(false);
  });
});

describe('useArrivalStage — reduced motion', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('keeps the same acts, just shorter entrances', () => {
    const { result } = renderStage('playing', true);
    expect(result.current).toBe('welcome');

    act(() => void vi.advanceTimersByTime(REDUCED_STAGE_TIMINGS.welcome));
    expect(result.current).toBe('welcome-out');
    act(() =>
      void vi.advanceTimersByTime(
        REDUCED_STAGE_TIMINGS.welcomeOut - REDUCED_STAGE_TIMINGS.welcome,
      ),
    );
    expect(result.current).toBe('gap');
    act(() =>
      void vi.advanceTimersByTime(REDUCED_STAGE_TIMINGS.gap - REDUCED_STAGE_TIMINGS.welcomeOut),
    );
    expect(result.current).toBe('presenting');
  });

  it('keeps both reading holds in full', () => {
    // Reduced motion means no travel and no movement — not "read faster".
    const welcomeHold = REDUCED_STAGE_TIMINGS.welcome - REDUCED_WELCOME_ENTERED_AT_MS;
    expect(welcomeHold).toBeGreaterThanOrEqual(MIN_WELCOME_HOLD_MS);
    expect(ARRIVAL_TIMINGS.reducedPlay - REDUCED_STAGE_TIMINGS.presentationSettled)
      .toBeGreaterThanOrEqual(MIN_READING_HOLD_MS);
  });
});

describe('useArrivalStage — the reading beat', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('settles into a reading beat once the entrance is done', () => {
    const { result } = renderStage('playing');
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.gap));
    expect(result.current).toBe('presenting');

    act(() =>
      void vi.advanceTimersByTime(
        STAGE_TIMINGS.presentationSettled - STAGE_TIMINGS.gap,
      ),
    );
    expect(result.current).toBe('reading');
    expect(isReadingBeat(result.current)).toBe(true);
  });

  it('holds the composition long enough to actually read it', () => {
    // The whole point of this pass. It measured ~440ms of stillness before —
    // enough to notice the card, not to read a heading, a line of microcopy
    // and the card itself.
    const hold = ARRIVAL_TIMINGS.play - STAGE_TIMINGS.presentationSettled;
    expect(hold).toBeGreaterThanOrEqual(MIN_READING_HOLD_MS);
  });

  it('cannot begin revealing the application before the hold is over', () => {
    // The reveal is driven by `PLAY_MS`, so this is the same guarantee stated
    // from the other side: the backdrop cannot start moving during the beat.
    expect(ARRIVAL_TIMINGS.play).toBeGreaterThan(STAGE_TIMINGS.presentationSettled);
  });

  it('keeps the whole composition unchanged throughout the beat', () => {
    expect(isIntroCopyVisible('reading')).toBe(true);
    expect(isFullCardContentVisible('reading')).toBe(true);
    expect(isCompactCardContentVisible('reading')).toBe(false);
    expect(isCardTransforming('reading')).toBe(false);
  });

  it('cannot begin the content transformation during either hold', () => {
    for (const stage of ['welcome', 'reading'] as ArrivalStage[]) {
      expect(isCardTransforming(stage)).toBe(false);
    }
    expect(isWelcomeHold('welcome')).toBe(true);
  });

  it('gives the presentation an unhurried, staged entrance', () => {
    // One coordinated entrance, assembling top-down: framing copy, then the
    // card 160ms behind it, then the reassurance once the card has settled.
    const entrance = STAGE_TIMINGS.presentationSettled - STAGE_TIMINGS.gap;
    expect(entrance).toBeGreaterThanOrEqual(1_000);
    expect(entrance).toBeLessThanOrEqual(1_300);
  });

  it('runs the ambient treatment only while the composition is still', () => {
    // During the entrance it would compete with what is arriving; from the
    // reveal onwards the card is on its way out.
    for (const stage of ALL_STAGES.filter((s) => s !== 'reading')) {
      expect(isReadingBeat(stage)).toBe(false);
    }
    expect(isReadingBeat('reading')).toBe(true);
  });

  it('keeps the reading beat under reduced motion', () => {
    // Reduced motion means no travel — not "skip the explanation".
    const { result } = renderStage('playing', true);
    act(() => void vi.advanceTimersByTime(REDUCED_STAGE_TIMINGS.presentationSettled));
    expect(result.current).toBe('reading');
  });
});

describe('useArrivalStage — the Explorer presentation gets time to be read', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('holds the whole composition still for about six seconds', () => {
    // The one moment in the arrival carrying real information: what Ditto
    // Explorer is, that it holds 4 short missions, and that finishing leads
    // somewhere. Two seconds was not enough to take that in.
    const hold = STAGE_TIMINGS.presentationOut - STAGE_TIMINGS.presentationSettled;
    expect(hold).toBeGreaterThanOrEqual(MIN_READING_HOLD_MS);
    expect(hold).toBeGreaterThanOrEqual(5_800);
    expect(hold).toBeCloseTo(6_000, -2);
  });

  it('counts no entrance or exit animation as reading time', () => {
    // The hold starts only once the last element (the reassurance) has landed,
    // and ends the moment the first one starts leaving.
    const { result } = renderStage('playing');
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.presentationSettled));
    expect(result.current).toBe('reading');
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.presentationOut - STAGE_TIMINGS.presentationSettled - 10));
    expect(result.current).toBe('reading');
    act(() => void vi.advanceTimersByTime(20));
    expect(result.current).toBe('copy-out');
  });

  it('shows the reassurance throughout the hold and nowhere else', () => {
    for (const stage of ALL_STAGES.filter((s) => s !== 'presenting' && s !== 'reading')) {
      expect(isReassuranceVisible(stage)).toBe(false);
    }
    expect(isReassuranceVisible('reading')).toBe(true);
  });

  it('removes the framing copy and the reassurance before the card transforms', () => {
    // The presentation finishes as a presentation. Nothing about the handoff
    // starts while there is still copy on screen leaving.
    for (const stage of ['copy-out', 'revealing', 'content-out', 'content-in', 'travelling'] as ArrivalStage[]) {
      expect(isIntroCopyVisible(stage)).toBe(false);
      expect(isReassuranceVisible(stage)).toBe(false);
    }
    expect(isCardTransforming('copy-out')).toBe(false);
  });

  it('names the copy exit as its own act, distinct from the reveal', () => {
    for (const stage of ALL_STAGES.filter((s) => s !== 'copy-out')) {
      expect(isCopyExiting(stage)).toBe(false);
    }
    expect(isCopyExiting('copy-out')).toBe(true);
  });

  it('leaves the card alone on an opaque backdrop while the copy exits', () => {
    // `copy-out` is inside `playing`, so the backdrop has not begun dissolving.
    const { result } = renderStage('playing');
    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.presentationOut + 10));
    expect(result.current).toBe('copy-out');
    expect(isFullCardContentVisible('copy-out')).toBe(true);
    expect(isPresentationStage('copy-out')).toBe(true);
  });

  it('cannot reveal the application at any point during the hold', () => {
    // The lifecycle's play window has to outlast the whole presentation,
    // otherwise the backdrop would start dissolving mid-sentence.
    expect(ARRIVAL_TIMINGS.play).toBeGreaterThan(STAGE_TIMINGS.presentationOut);
    expect(ARRIVAL_TIMINGS.reducedPlay).toBeGreaterThan(REDUCED_STAGE_TIMINGS.presentationOut);
  });

  it('continues on its own, with no input, once the hold is over', () => {
    const { result } = renderStage('playing');
    act(() => void vi.advanceTimersByTime(ARRIVAL_TIMINGS.play));
    expect(result.current).toBe('copy-out');
  });

  it('gives reduced motion the same reading time, only shorter entrances', () => {
    const full = STAGE_TIMINGS.presentationOut - STAGE_TIMINGS.presentationSettled;
    const reduced =
      REDUCED_STAGE_TIMINGS.presentationOut - REDUCED_STAGE_TIMINGS.presentationSettled;
    expect(reduced).toBe(full);
    expect(reduced).toBeGreaterThanOrEqual(5_800);
    // The entrance, by contrast, is allowed to be brisk.
    expect(REDUCED_STAGE_TIMINGS.presentationSettled - REDUCED_STAGE_TIMINGS.gap)
      .toBeLessThan(STAGE_TIMINGS.presentationSettled - STAGE_TIMINGS.gap);
  });
});
