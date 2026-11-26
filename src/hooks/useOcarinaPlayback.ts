import { useCallback, useEffect, useRef, useState } from 'react';

import { playOcarinaSong, primeOcarina } from '@/lib/ocarinaAudio';
import type { Song } from '@/lib/ocarinaSong';

/** Whatever song is playing anywhere, so starting one stops the last. */
let stopCurrent: (() => void) | null = null;

/** Play a song and follow along: whether it's playing, and which note is sounding. */
export function useOcarinaPlayback() {
  const [playing, setPlaying] = useState(false);
  /** How many notes have sounded so far. */
  const [heard, setHeard] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    if (stopRef.current) {
      if (stopCurrent === stopRef.current) stopCurrent = null;
      stopRef.current();
      stopRef.current = null;
    }
    setPlaying(false);
  }, []);

  const play = useCallback((song: Pick<Song, 'notes' | 'bpm'>, onEnd?: () => void) => {
    primeOcarina();
    stopCurrent?.();
    stopRef.current?.();
    setHeard(0);
    setPlaying(true);
    // Another song starting stops this one, and says so here.
    const stopped = () => {
      stopThis();
      setPlaying(false);
    };
    const stopThis = playOcarinaSong(song, {
      onNote: (index) => setHeard(index + 1),
      onEnd: () => {
        if (stopCurrent === stopped) stopCurrent = null;
        if (stopRef.current === stopped) stopRef.current = null;
        setPlaying(false);
        onEnd?.();
      },
    });
    stopRef.current = stopped;
    stopCurrent = stopped;
  }, []);

  useEffect(() => () => stopRef.current?.(), []);

  return { play, stop, playing, heard };
}
