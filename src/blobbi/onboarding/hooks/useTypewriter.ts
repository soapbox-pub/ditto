import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Typewriter effect hook — reveals text character-by-character.
 *
 * Used by both the hatching and evolution ceremonies.
 *
 * @param fullText  The complete string to reveal.
 * @param active    Start typing when true.
 * @param speed     Milliseconds between characters (default 35).
 */
export function useTypewriter(fullText: string, active: boolean, speed = 35) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);

  // Reset when text changes
  useEffect(() => {
    setDisplayed('');
    setDone(false);
    indexRef.current = 0;
  }, [fullText]);

  // Run typewriter
  useEffect(() => {
    if (!active || done) return;

    intervalRef.current = setInterval(() => {
      indexRef.current++;
      const next = fullText.slice(0, indexRef.current);
      setDisplayed(next);
      if (indexRef.current >= fullText.length) {
        setDone(true);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, speed);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [active, done, fullText, speed]);

  const complete = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setDisplayed(fullText);
    setDone(true);
  }, [fullText]);

  return { displayed, done, complete };
}
