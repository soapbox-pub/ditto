import { createContext, useContext } from 'react';

interface OnboardingContextValue {
  startSignup: () => void;
}

export const OnboardingContext = createContext<OnboardingContextValue>({
  startSignup: () => {},
});

/** Call `startSignup()` from anywhere to open the full-screen signup onboarding. */
export function useOnboarding() {
  return useContext(OnboardingContext);
}
