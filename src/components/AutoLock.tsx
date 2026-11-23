import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useNostrLogin } from '@nostrify/react/login';
import { useEffect } from 'react';

import { lockNow, useAnyKeyLocked, useAutoLockMinutes } from '@/lib/keyLock';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Watching a video or listening to a track without touching anything isn't idle. */
function mediaPlaying(): boolean {
  return Array.from(document.querySelectorAll('video, audio')).some(
    (el) => el instanceof HTMLMediaElement && !el.paused && !el.ended,
  );
}

/**
 * Locks a password-locked account again after the chosen idle time. Time in the
 * background counts as idle: timers stall there, so the check also runs on resume.
 */
export function AutoLock() {
  const { logins } = useNostrLogin();
  // Any locked account's key is open in memory, not just the active one's.
  const locked = useAnyKeyLocked(logins.filter((login) => login.type === 'nsec').map((login) => login.pubkey));
  const minutes = useAutoLockMinutes();

  useEffect(() => {
    if (!locked || minutes === 0) return;
    const limit = minutes * 60_000;
    let last = Date.now();
    const touch = () => {
      last = Date.now();
    };
    const check = () => {
      if (mediaPlaying()) touch();
      else if (Date.now() - last >= limit) lockNow();
    };
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, touch, { passive: true, capture: true });
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 15_000);
    const resume = Capacitor.isNativePlatform() ? CapacitorApp.addListener('resume', check) : null;
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, touch, { capture: true });
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
      void resume?.then((h) => h.remove());
    };
  }, [locked, minutes]);

  return null;
}
