import { createContext, useContext } from 'react';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';
import { isLocalhostDev } from './index';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmotionDevContextValue {
  /** Current dev emotion override (null = use default/neutral) */
  devEmotion: BlobbiEmotion | null;
  /** Set the dev emotion override */
  setDevEmotion: (emotion: BlobbiEmotion | null) => void;
  /** Clear the dev emotion override (back to neutral) */
  clearDevEmotion: () => void;
  /** Whether dev emotion is active */
  isDevEmotionActive: boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

export const EmotionDevContext = createContext<EmotionDevContextValue | null>(null);

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Hook to access dev emotion state.
 * Returns null values in production for safety.
 */
export function useEmotionDev(): EmotionDevContextValue {
  const context = useContext(EmotionDevContext);
  
  // Outside localhost dev or if no provider, return safe defaults
  if (!isLocalhostDev() || !context) {
    return {
      devEmotion: null,
      setDevEmotion: () => {},
      clearDevEmotion: () => {},
      isDevEmotionActive: false,
    };
  }
  
  return context;
}

/**
 * Get the effective emotion for a Blobbi.
 * In dev mode with an override, returns the dev emotion.
 * Otherwise returns the provided emotion or 'neutral'.
 */
export function useEffectiveEmotion(baseEmotion?: BlobbiEmotion): BlobbiEmotion {
  const { devEmotion, isDevEmotionActive } = useEmotionDev();
  
  // Dev override takes precedence (only in localhost dev)
  if (isLocalhostDev() && isDevEmotionActive && devEmotion) {
    return devEmotion;
  }
  
  return baseEmotion ?? 'neutral';
}
