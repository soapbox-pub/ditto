import type { NavigateFunction } from 'react-router-dom';

let navigateRef: NavigateFunction | null = null;

/** Set (or clear) the navigate ref from inside a Router context. */
export function setCanvasNavigateRef(navigate: NavigateFunction | null): void {
  navigateRef = navigate;
}

/**
 * Navigate to a path using the captured router navigate function.
 * Returns `false` when no ref is set (CanvasRuntimeProvider hasn't been bridged
 * yet), so the adapter can report ``not_implemented``.
 */
export function canvasNavigateTo(path: string): boolean {
  if (!navigateRef) return false;
  navigateRef(path);
  return true;
}