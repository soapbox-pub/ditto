import { useState, useEffect, useCallback, useMemo } from 'react';
import { isSpecialMarkSupported } from '../lib/special-marks-utils';

interface UseSpecialMarkOptions {
  /** Whether to enable animations */
  animated?: boolean;
  /** Opacity level (0-1) */
  opacity?: number;
  /** Whether to auto-animate based on mark type */
  autoAnimate?: boolean;
  /** Performance mode - reduces animations on low-power devices */
  performanceMode?: boolean;
}

interface SpecialMarkState {
  /** Current special mark */
  mark: string | null;
  /** Whether animations are active */
  isAnimated: boolean;
  /** Current opacity */
  opacity: number;
  /** Whether the mark is supported */
  isSupported: boolean;
  /** Whether to use fallback rendering */
  useFallback: boolean;
}

export const useSpecialMark = (
  initialMark: string | null = null,
  options: UseSpecialMarkOptions = {}
) => {
  const { animated = true, opacity = 1, autoAnimate = true, performanceMode = false } = options;

  // State for the special mark
  const [state, setState] = useState<SpecialMarkState>(() => ({
    mark: initialMark,
    isAnimated: animated && autoAnimate,
    opacity,
    isSupported: initialMark ? isSpecialMarkSupported(initialMark) : false,
    useFallback: false,
  }));

  // Detect if we should use performance mode
  const shouldUsePerformanceMode = useMemo(() => {
    if (performanceMode) return true;

    // Auto-detect low-power devices
    if (typeof navigator !== 'undefined') {
      // Check for reduced motion preference
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return true;
      }

      // Check for low-end devices (basic heuristics)
      const connection = (navigator as unknown as { connection?: { effectiveType?: string } })
        .connection;
      if (
        connection &&
        connection.effectiveType &&
        ['slow-2g', '2g'].includes(connection.effectiveType)
      ) {
        return true;
      }

      // Check for limited memory
      const deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
      if (deviceMemory && deviceMemory < 4) {
        return true;
      }
    }

    return false;
  }, [performanceMode]);

  // Update special mark
  const setSpecialMark = useCallback(
    (newMark: string | null) => {
      setState((prev) => ({
        ...prev,
        mark: newMark,
        isSupported: newMark ? isSpecialMarkSupported(newMark) : false,
        useFallback:
          shouldUsePerformanceMode || (newMark ? !isSpecialMarkSupported(newMark) : false),
      }));
    },
    [shouldUsePerformanceMode]
  );

  // Toggle animation
  const toggleAnimation = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isAnimated: !prev.isAnimated,
    }));
  }, []);

  // Set opacity
  const setOpacity = useCallback((newOpacity: number) => {
    const clampedOpacity = Math.max(0, Math.min(1, newOpacity));
    setState((prev) => ({
      ...prev,
      opacity: clampedOpacity,
    }));
  }, []);

  // Enable/disable animations based on performance mode
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      isAnimated: animated && autoAnimate && !shouldUsePerformanceMode,
      useFallback:
        shouldUsePerformanceMode || (prev.mark ? !isSpecialMarkSupported(prev.mark) : false),
    }));
  }, [animated, autoAnimate, shouldUsePerformanceMode]);

  // Auto-animate certain marks
  useEffect(() => {
    if (!autoAnimate || !state.mark) return;

    const shouldAutoAnimate = ['sigil_eye', 'glow_crack_pattern', 'rune_top'].includes(state.mark);

    setState((prev) => ({
      ...prev,
      isAnimated: animated && shouldAutoAnimate && !shouldUsePerformanceMode,
    }));
  }, [state.mark, animated, autoAnimate, shouldUsePerformanceMode]);

  // Preload special mark assets (for better performance)
  const preloadSpecialMark = useCallback((mark: string) => {
    if (!isSpecialMarkSupported(mark)) return;

    // This could be extended to preload SVG assets if they were external files
    // For now, since they're inline, this is a placeholder for future optimization
    console.debug(`Preloading special mark: ${mark}`);
  }, []);

  // Get animation class for the current mark
  const getAnimationClass = useCallback(() => {
    if (!state.isAnimated || !state.mark) return '';

    switch (state.mark) {
      case 'sigil_eye':
        return 'animate-sigil-pulse';
      case 'shimmer_band':
        return ''; // shimmer_band should always be static and centered
      case 'glow_crack_pattern':
        return 'animate-glow-pulse';
      case 'rune_top':
        return 'animate-rune-glow';
      default:
        return 'animate-mystical-float';
    }
  }, [state.isAnimated, state.mark]);

  // Get performance-optimized props
  const getOptimizedProps = useCallback(() => {
    return {
      specialMark: state.mark,
      animated: state.isAnimated,
      opacity: state.opacity,
      className: getAnimationClass(),
      useFallback: state.useFallback,
    };
  }, [state, getAnimationClass]);

  return {
    // State
    specialMark: state.mark,
    isAnimated: state.isAnimated,
    opacity: state.opacity,
    isSupported: state.isSupported,
    useFallback: state.useFallback,
    performanceMode: shouldUsePerformanceMode,

    // Actions
    setSpecialMark,
    toggleAnimation,
    setOpacity,
    preloadSpecialMark,

    // Utilities
    getAnimationClass,
    getOptimizedProps,

    // Validation
    isValidMark: (mark: string) => isSpecialMarkSupported(mark),
  };
};

// Hook for managing multiple special marks (for collections, etc.)
export const useSpecialMarkCollection = (
  initialMarks: string[] = [],
  options: UseSpecialMarkOptions = {}
) => {
  const [marks, setMarks] = useState<string[]>(initialMarks);
  const [activeIndex, setActiveIndex] = useState(0);

  const currentMark = marks[activeIndex] || null;
  const specialMarkHook = useSpecialMark(currentMark, options);

  const addMark = useCallback(
    (mark: string) => {
      if (isSpecialMarkSupported(mark) && !marks.includes(mark)) {
        setMarks((prev) => [...prev, mark]);
      }
    },
    [marks]
  );

  const removeMark = useCallback(
    (mark: string) => {
      setMarks((prev) => {
        const newMarks = prev.filter((m) => m !== mark);
        // Adjust active index if necessary
        if (activeIndex >= newMarks.length) {
          setActiveIndex(Math.max(0, newMarks.length - 1));
        }
        return newMarks;
      });
    },
    [activeIndex]
  );

  const nextMark = useCallback(() => {
    if (marks.length > 1) {
      setActiveIndex((prev) => (prev + 1) % marks.length);
    }
  }, [marks.length]);

  const previousMark = useCallback(() => {
    if (marks.length > 1) {
      setActiveIndex((prev) => (prev - 1 + marks.length) % marks.length);
    }
  }, [marks.length]);

  const selectMark = useCallback(
    (index: number) => {
      if (index >= 0 && index < marks.length) {
        setActiveIndex(index);
      }
    },
    [marks.length]
  );

  return {
    ...specialMarkHook,

    // Collection state
    marks,
    activeIndex,
    currentMark,
    hasMultipleMarks: marks.length > 1,

    // Collection actions
    addMark,
    removeMark,
    nextMark,
    previousMark,
    selectMark,
    setMarks,
  };
};
