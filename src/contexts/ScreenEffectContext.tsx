import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

import type { PrecipitationIntensity } from '@/hooks/useWeather';

// ─── Types ───

/** A visual effect rendered as a full-screen overlay. Extend this union to add new effects. */
export type ScreenEffect =
  | { type: 'rain' | 'snow'; intensity: PrecipitationIntensity }
  // Future effects can be added here:
  // | { type: 'confetti'; duration?: number }
  // | { type: 'fireworks' }
  ;

export interface ScreenEffectContextValue {
  /** The currently active screen effect, or null if none. */
  screenEffect: ScreenEffect | null;
  /** Set or clear the screen effect. Pass null to stop. */
  setScreenEffect: (effect: ScreenEffect | null) => void;
}

// ─── Context ───

const ScreenEffectCtx = createContext<ScreenEffectContextValue | null>(null);

// ─── Persistence ───

const STORAGE_KEY = 'ditto:screen-effect';

function loadEffect(): ScreenEffect | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Basic validation
    if (parsed && typeof parsed.type === 'string') {
      return parsed as ScreenEffect;
    }
    return null;
  } catch {
    return null;
  }
}

function saveEffect(effect: ScreenEffect | null): void {
  try {
    if (effect) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(effect));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage full or unavailable
  }
}

// ─── Provider ───

export function ScreenEffectProvider({ children }: { children: ReactNode }) {
  const [screenEffect, setScreenEffectRaw] = useState<ScreenEffect | null>(loadEffect);

  const setScreenEffect = useCallback((effect: ScreenEffect | null) => {
    setScreenEffectRaw(effect);
    saveEffect(effect);
  }, []);

  return (
    <ScreenEffectCtx.Provider value={{ screenEffect, setScreenEffect }}>
      {children}
    </ScreenEffectCtx.Provider>
  );
}

// ─── Hook ───

export function useScreenEffect(): ScreenEffectContextValue {
  const ctx = useContext(ScreenEffectCtx);
  if (!ctx) {
    throw new Error('useScreenEffect must be used within a ScreenEffectProvider');
  }
  return ctx;
}
