import { useMissionEngine } from '@/hooks/useMissionEngine';

/**
 * Headless mount point for the post-onboarding mission engine.
 *
 * Rendered exactly once, from `MainLayout`, so mission initialization and
 * completion detection run in one place regardless of which page (or how many
 * mission surfaces) happen to be on screen. Renders nothing.
 *
 * Keeping this a component rather than a hook call inside `MainLayoutInner`
 * means the engine's queries and effects re-render only this node instead of
 * the whole app shell on every mission state change.
 */
export function MissionEngine() {
  useMissionEngine();
  return null;
}
