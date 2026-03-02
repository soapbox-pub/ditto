import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';

/**
 * Auto-minimizes the audio player when the user navigates to a different page.
 * No dialog — audio just keeps playing in the floating mini-bar.
 */
export function AudioNavigationGuard() {
  const { currentTrack, minimized, minimize } = useAudioPlayer();
  const location = useLocation();
  const prevPath = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      // Route changed — minimize if playing and expanded
      if (currentTrack && !minimized) {
        minimize();
      }
      prevPath.current = location.pathname;
    }
  }, [location.pathname, currentTrack, minimized, minimize]);

  return null;
}
