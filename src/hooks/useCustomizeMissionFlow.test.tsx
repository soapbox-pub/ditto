import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useCustomizeMissionFlow } from './useCustomizeMissionFlow';
import {
  createInitialGuideState,
  type PostOnboardingGuideState,
} from '@/lib/postOnboardingGuide';

let state: PostOnboardingGuideState | undefined;
let routeState: unknown = null;
const navigate = vi.fn();

vi.mock('./usePostOnboardingGuide', () => ({
  usePostOnboardingGuide: () => ({
    state,
    isActive: state?.status === 'active',
  }),
}));
vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/settings/profile', state: routeState }),
  useNavigate: () => navigate,
}));

function seed(overrides: Partial<PostOnboardingGuideState> = {}) {
  state = { ...createInitialGuideState(1_000), ...overrides };
}

/**
 * The customize flow is presentational: it decides whether the helper card
 * belongs on this page, and never completes anything. Completion lives in
 * `useMissionEngine`, which watches the actual profile and theme.
 */
describe('useCustomizeMissionFlow', () => {
  beforeEach(() => {
    state = undefined;
    routeState = null;
    navigate.mockClear();
  });

  it('is inactive without a mission', () => {
    expect(renderHook(() => useCustomizeMissionFlow()).result.current.flowActive).toBe(false);
  });

  it('is inactive on a normal visit to the page', () => {
    // Opening profile settings on your own is not a mission; the helper card
    // must not appear uninvited.
    seed();
    expect(renderHook(() => useCustomizeMissionFlow()).result.current.flowActive).toBe(false);
  });

  it('activates when the user arrives from the mission', () => {
    seed();
    routeState = { missionTask: 'customize' };
    expect(renderHook(() => useCustomizeMissionFlow()).result.current.flowActive).toBe(true);
  });

  it('clears the route state so a refresh or back does not re-trigger it', () => {
    seed();
    routeState = { missionTask: 'customize' };
    renderHook(() => useCustomizeMissionFlow());
    expect(navigate).toHaveBeenCalledWith('/settings/profile', { replace: true, state: null });
  });

  it('stays active after a reload once a substep has landed', () => {
    // Step 1 done, user navigates straight to themes: no route state, but the
    // flow must still show step 2.
    seed({ customize: { profileCompleted: true } });
    const { result } = renderHook(() => useCustomizeMissionFlow());
    expect(result.current.flowActive).toBe(true);
    expect(result.current.profileDone).toBe(true);
    expect(result.current.themeDone).toBe(false);
  });

  it('reports both substeps independently', () => {
    seed({ customize: { profileCompleted: true, themeCompleted: true } });
    const { result } = renderHook(() => useCustomizeMissionFlow());
    expect(result.current.profileDone).toBe(true);
    expect(result.current.themeDone).toBe(true);
  });

  it('deactivates once the customize task is complete', () => {
    seed({
      customize: { profileCompleted: true, themeCompleted: true },
      paths: {
        'find-people': 'not_started',
        'post-small': 'not_started',
        customize: 'completed',
        interact: 'not_started',
      },
    });
    const { result } = renderHook(() => useCustomizeMissionFlow());
    expect(result.current.flowActive).toBe(false);
    expect(result.current.pathCompleted).toBe(true);
  });

  it('deactivates for a dismissed mission even with substep progress', () => {
    seed({ status: 'skipped', customize: { profileCompleted: true } });
    expect(renderHook(() => useCustomizeMissionFlow()).result.current.flowActive).toBe(false);
  });

  it('exposes no way to complete a step', () => {
    // Completion is the engine's job; if this hook could complete a substep,
    // the helper card could claim progress the user never made.
    seed();
    const { result } = renderHook(() => useCustomizeMissionFlow());
    expect(Object.keys(result.current)).toEqual([
      'flowActive',
      'profileDone',
      'themeDone',
      'pathCompleted',
    ]);
  });
});
