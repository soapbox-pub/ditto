/**
 * EmotionDevContext
 * 
 * DEV-ONLY context for testing emotions on Blobbies.
 * This context:
 * - Only works in development mode
 * - Does NOT modify real Blobbi state
 * - Does NOT publish events
 * - Does NOT persist anywhere
 * - Is purely for visual testing/debugging
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmotionDevContextValue {
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

const EmotionDevContext = createContext<EmotionDevContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface EmotionDevProviderProps {
  children: ReactNode;
}

/**
 * Provider for dev emotion testing.
 * Only functional in development mode.
 */
export function EmotionDevProvider({ children }: EmotionDevProviderProps) {
  const [devEmotion, setDevEmotionState] = useState<BlobbiEmotion | null>(null);
  
  const setDevEmotion = useCallback((emotion: BlobbiEmotion | null) => {
    // Only allow in development
    if (!import.meta.env.DEV) return;
    setDevEmotionState(emotion);
  }, []);
  
  const clearDevEmotion = useCallback(() => {
    setDevEmotionState(null);
  }, []);
  
  const value: EmotionDevContextValue = {
    devEmotion,
    setDevEmotion,
    clearDevEmotion,
    isDevEmotionActive: devEmotion !== null,
  };
  
  return (
    <EmotionDevContext.Provider value={value}>
      {children}
    </EmotionDevContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook to access dev emotion state.
 * Returns null values in production for safety.
 */
export function useEmotionDev(): EmotionDevContextValue {
  const context = useContext(EmotionDevContext);
  
  // In production or if no provider, return safe defaults
  if (!import.meta.env.DEV || !context) {
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
  
  // Dev override takes precedence
  if (import.meta.env.DEV && isDevEmotionActive && devEmotion) {
    return devEmotion;
  }
  
  return baseEmotion ?? 'neutral';
}
