import { createContext, useContext } from 'react';

interface OnboardingContextValue {
  startSignup: () => void;
  /** Signup or first-run setup is on screen; the app behind it is only preloaded. */
  active: boolean;
}

export const OnboardingContext = createContext<OnboardingContextValue>({
  startSignup: () => {},
  active: false,
});

/** Call `startSignup()` from anywhere to open the full-screen signup onboarding. */
export function useOnboarding() {
  return useContext(OnboardingContext);
}
