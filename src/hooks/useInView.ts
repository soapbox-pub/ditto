import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseInViewOptions {
  /** IntersectionObserver threshold (fraction of the element that must be visible). */
  threshold?: number | number[];
  /** IntersectionObserver root margin, e.g. `'400px'` to trigger early. */
  rootMargin?: string;
  /** When true, no observer is created and `inView` stays false. */
  skip?: boolean;
}

export interface UseInViewResult {
  /** Callback ref — attach to the element to observe. */
  ref: (node: Element | null) => void;
  /** Whether the observed element currently intersects the viewport. */
  inView: boolean;
}

/**
 * Track whether an element is visible in the viewport using
 * IntersectionObserver. Hand-rolled replacement for the
 * `react-intersection-observer` package covering the options Ditto uses.
 */
export function useInView(options: UseInViewOptions = {}): UseInViewResult {
  const { threshold, rootMargin, skip } = options;
  const [inView, setInView] = useState(false);
  const [node, setNode] = useState<Element | null>(null);
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

  // While skipped, the node goes only into a ref. Putting it in state costs the
  // caller a second render on mount, and callers like NoteCard skip for almost
  // every instance. The effect picks the ref up if `skip` later turns false.
  const nodeRef = useRef<Element | null>(null);
  const skipRef = useRef(skip);
  skipRef.current = skip;

  const ref = useCallback((next: Element | null) => {
    nodeRef.current = next;
    if (!skipRef.current) setNode(next);
  }, []);

  // Serialize array thresholds so the effect doesn't re-run on new array identity.
  const thresholdKey = Array.isArray(threshold) ? threshold.join(',') : threshold;

  useEffect(() => {
    // `node` is only a re-run trigger; the ref always holds the live element.
    const target = nodeRef.current;
    if (skip || !target || typeof IntersectionObserver === 'undefined') {
      if (inViewRef.current) setInView(false);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        // Use the most recent entry for this element.
        const entry = entries[entries.length - 1];
        setInView(entry.isIntersecting);
      },
      {
        threshold: thresholdKey === undefined
          ? undefined
          : typeof thresholdKey === 'number'
            ? thresholdKey
            : thresholdKey.split(',').map(Number),
        rootMargin,
      },
    );

    observer.observe(target);
    return () => {
      observer.disconnect();
      setInView(false);
    };
  }, [node, thresholdKey, rootMargin, skip]);

  return { ref, inView };
}
