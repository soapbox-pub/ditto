import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Clicking a settled (face-up) tarot card scrolls to its interpretation
 * section and briefly highlights it. Shared between the reader page and the
 * feed/detail reading cards: attach `sectionRefs` to each section's wrapper,
 * call `jumpToSection(index)` from the card, and pass
 * `highlightIndex === index` to the section's `highlighted` prop.
 */
export function useTarotSectionJump() {
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const highlightTimer = useRef<number | undefined>(undefined);

  const jumpToSection = useCallback((index: number) => {
    const el = sectionRefs.current[index];
    if (!el) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    el.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    setHighlightIndex(index);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => setHighlightIndex(null),
      1800,
    );
  }, []);

  useEffect(() => {
    return () => window.clearTimeout(highlightTimer.current);
  }, []);

  return { highlightIndex, sectionRefs, jumpToSection };
}
