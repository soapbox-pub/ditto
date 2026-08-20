import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useMissionFlowEntry } from './useMissionFlowEntry';
import {
  createInitialGuideState,
  type PostOnboardingGuideState,
  type PostOnboardingPathId,
} from '@/lib/postOnboardingGuide';

/**
 * Which page is standing in for which task.
 *
 * Every guided task's helper asks this one question, so it is tested once here
 * rather than three times through three components. The two signals matter for
 * different reasons and both are checked: route state covers the moment right
 * after the mission navigates, before its write has landed, and `activePath`
 * covers everything after — a reload, a second tab, a wander away and back.
 */

let state: PostOnboardingGuideState | undefined;
let isActive = true;

vi.mock('./usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => ({ state, isActive }),
}));

/** The location as the hook left it, so the history clean-up is observable. */
let seenState: unknown;
function LocationProbe() {
  seenState = useLocation().state;
  return null;
}

function renderEntry(task: PostOnboardingPathId, routeState?: unknown) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[{ pathname: '/search', state: routeState }]}>
      <Routes>
        <Route
          path="/search"
          element={
            <>
              <LocationProbe />
              {children}
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
  return renderHook(() => useMissionFlowEntry(task), { wrapper });
}

beforeEach(() => {
  state = createInitialGuideState(1_000);
  isActive = true;
  seenState = undefined;
});

describe('useMissionFlowEntry', () => {
  it('recognises the navigation the mission just made', () => {
    // `startPath` is a round trip to encrypted settings. Without this the
    // helper would be missing on exactly the page the user was just sent to.
    const { result } = renderEntry('find-people', { missionTask: 'find-people' });
    expect(result.current.startedViaMission).toBe(true);
  });

  it('drops the route state from history once it has been read', () => {
    // Otherwise a refresh or a Back replays the mission's navigation.
    renderEntry('find-people', { missionTask: 'find-people' });
    expect(seenState).toBeNull();
  });

  it('keeps the latch after the route state is gone', () => {
    const { result, rerender } = renderEntry('find-people', { missionTask: 'find-people' });
    rerender();
    expect(result.current.startedViaMission).toBe(true);
  });

  it('ignores a navigation that started a different task', () => {
    const { result } = renderEntry('find-people', { missionTask: 'interact' });
    expect(result.current.startedViaMission).toBe(false);
    // Not this page's business, so it stays in history for whoever it is for.
    expect(seenState).toEqual({ missionTask: 'interact' });
  });

  it('survives a reload on the persisted task alone', () => {
    // No route state at all — a refresh, a second tab, another device.
    state = { ...createInitialGuideState(1_000), activePath: 'find-people' };
    const { result } = renderEntry('find-people');
    expect(result.current.startedViaMission).toBe(true);
  });

  it('cannot keep explaining a task the user has left', () => {
    state = { ...createInitialGuideState(1_000), activePath: 'post-small' };
    const { result } = renderEntry('find-people');
    expect(result.current.startedViaMission).toBe(false);
  });

  it('reports a finished task as finished', () => {
    const base = createInitialGuideState(1_000);
    state = { ...base, activePath: 'find-people', paths: { ...base.paths, 'find-people': 'completed' } };
    const { result } = renderEntry('find-people');
    expect(result.current.pathCompleted).toBe(true);
  });

  it('reports a dismissed or finished mission as inactive', () => {
    isActive = false;
    const { result } = renderEntry('find-people', { missionTask: 'find-people' });
    expect(result.current.isActive).toBe(false);
  });

  it('says nothing is running when there is no mission at all', () => {
    state = undefined;
    const { result } = renderEntry('find-people');
    expect(result.current.startedViaMission).toBe(false);
    expect(result.current.pathCompleted).toBe(false);
  });

  it.each(['find-people', 'post-small', 'customize', 'interact'] as const)(
    'answers for every task the same way (%s)',
    (task) => {
      const { result } = renderEntry(task, { missionTask: task });
      expect(result.current.startedViaMission).toBe(true);
    },
  );
});
