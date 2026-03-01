import { useRef, useState, useEffect, useCallback, RefObject } from 'react';

interface UsePlayerControlsOptions {
  /** The media element (audio or video) to observe and pause when offscreen. */
  mediaRef: RefObject<HTMLMediaElement | null>;
  /** The container element to observe for IntersectionObserver and mouse events. */
  containerRef: RefObject<HTMLElement | null>;
  /** Whether the media is currently playing. */
  isPlaying: boolean;
}

interface UsePlayerControlsReturn {
  showControls: boolean;
  revealControls: () => void;
  scheduleHide: () => void;
}

/**
 * Shared player control behaviour used by both VideoPlayer and AudioVisualizer:
 * - Auto-hides controls 2.5 s after the last mouse movement while playing.
 * - Pauses playback when the container scrolls out of view.
 */
export function usePlayerControls({
  mediaRef,
  containerRef,
  isPlaying,
}: UsePlayerControlsOptions): UsePlayerControlsReturn {
  const [showControls, setShowControls] = useState(true);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const scheduleHide = useCallback(() => {
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    if (isPlaying) {
      hideTimeoutRef.current = setTimeout(() => setShowControls(false), 2500);
    }
  }, [isPlaying]);

  const revealControls = useCallback(() => {
    setShowControls(true);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    if (isPlaying) {
      scheduleHide();
    } else {
      setShowControls(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    }
    return () => { if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current); };
  }, [isPlaying, scheduleHide]);

  // Pause when scrolled out of view
  useEffect(() => {
    const media = mediaRef.current;
    const container = containerRef.current;
    if (!media || !container) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (!entry.isIntersecting && !media.paused) media.pause(); },
      { threshold: 0.25 },
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [mediaRef, containerRef]);

  return { showControls, revealControls, scheduleHide };
}
