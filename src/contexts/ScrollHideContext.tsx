import { createContext, useContext } from 'react';

/**
 * Provides the current state of the scroll-hide chrome (top bar + bottom nav).
 * When `hidden` is true the mobile top bar has been translated off-screen.
 * Sticky sub-headers should shift to `top-0` so they fill the vacated space.
 */
export interface ScrollHideState {
  hidden: boolean;
}

export const ScrollHideContext = createContext<ScrollHideState>({ hidden: false });

export function useScrollHide(): ScrollHideState {
  return useContext(ScrollHideContext);
}
