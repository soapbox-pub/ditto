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

import { useState, useCallback, type ReactNode } from 'react';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';
import { isLocalhostDev } from './index';
import { EmotionDevContext, type EmotionDevContextValue } from './useEmotionDev';

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
    // Only allow in localhost development
    if (!isLocalhostDev()) return;
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


