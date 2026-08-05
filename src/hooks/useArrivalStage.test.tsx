import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  REDUCED_STAGE_TIMINGS,
  STAGE_TIMINGS,
  isCardSimplified,
  isIntroCopyVisible,
  isPresentationStage,
  isWelcomeStage,
  useArrivalStage,
  type ArrivalStage,
} from './useArrivalStage';
import type { ArrivalPhase } from './useFirstArrivalExperience';

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

    expect(seen).toEqual(['signal', 'welcome', 'welcome-out', 'presenting']);
  });

  it('gives the welcome a genuinely readable moment before anything else', () => {
    // The previous pass left it fully readable for ~215ms before the card
    // arrived on top of it, which is what made the two acts blur together.
    const readable = STAGE_TIMINGS.welcome - STAGE_TIMINGS.signal;
    expect(readable).toBeGreaterThanOrEqual(700);
  });

  it('never reports welcome and presentation at the same time', () => {
    // The layers are mounted from these predicates, so a stage that satisfied
    // both would put two pieces of copy on screen at once.
    const stages: ArrivalStage[] = [
      'signal', 'welcome', 'welcome-out', 'presenting',
      'revealing', 'preparing', 'travelling', 'done',
    ];
    for (const stage of stages) {
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

  it('prepares the handoff before the travel begins', () => {
    const { result, rerender } = renderStage('playing');
    rerender({ phase: 'revealing', reducedMotion: false });
    expect(result.current).toBe('revealing');

    act(() => void vi.advanceTimersByTime(STAGE_TIMINGS.prepareAfterReveal));
    expect(result.current).toBe('preparing');
  });

  it('removes the framing copy before the card moves', () => {
    // It belongs to the central stage only and must never travel.
    expect(isIntroCopyVisible('preparing')).toBe(false);
    expect(isIntroCopyVisible('travelling')).toBe(false);
  });

  it('simplifies the card during preparation, ahead of the travel', () => {
    expect(isCardSimplified('revealing')).toBe(false);
    expect(isCardSimplified('preparing')).toBe(true);
    expect(isCardSimplified('travelling')).toBe(true);
  });

  it('keeps the card mounted from presentation through to travel', () => {
    for (const stage of ['presenting', 'revealing', 'preparing', 'travelling'] as ArrivalStage[]) {
      expect(isPresentationStage(stage)).toBe(true);
    }
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

  it('keeps the same acts, just shorter', () => {
    const { result } = renderStage('playing', true);
    expect(result.current).toBe('welcome');

    act(() => void vi.advanceTimersByTime(REDUCED_STAGE_TIMINGS.welcome));
    expect(result.current).toBe('welcome-out');
    act(() =>
      void vi.advanceTimersByTime(
        REDUCED_STAGE_TIMINGS.welcomeOut - REDUCED_STAGE_TIMINGS.welcome,
      ),
    );
    expect(result.current).toBe('presenting');
  });

  it('still separates the welcome from the presentation', () => {
    // Reduced motion means no travel and no movement — not one merged frame.
    expect(REDUCED_STAGE_TIMINGS.welcome).toBeGreaterThan(0);
    expect(REDUCED_STAGE_TIMINGS.welcomeOut).toBeGreaterThan(REDUCED_STAGE_TIMINGS.welcome);
  });
});

describe('useArrivalStage — development harness entries', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it.each([
    ['welcome', 'welcome'],
    ['presenting', 'presenting'],
  ] as const)('starts directly on the %s act', (entry, expected) => {
    const { result } = renderHook(() =>
      useArrivalStage({ phase: 'playing', reducedMotion: false, entry }),
    );
    expect(result.current).toBe(expected);

    // …and holds there rather than being pushed on by the act timers.
    act(() => void vi.advanceTimersByTime(5_000));
    expect(result.current).toBe(expected);
  });

  it('enters the travel directly for the handoff scenario', () => {
    const { result } = renderHook(() =>
      useArrivalStage({ phase: 'travelling', reducedMotion: false, entry: 'handoff' }),
    );
    expect(result.current).toBe('travelling');
  });
});
