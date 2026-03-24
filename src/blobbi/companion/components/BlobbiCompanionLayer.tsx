/**
 * BlobbiCompanionLayer
 * 
 * Global layer component that renders the companion above all other content.
 * This should be placed at the root level of the app.
 * 
 * Behavior varies based on screen size:
 * - Desktop (with sidebar): Companion emerges from behind the sidebar with a playful
 *   "squeezing out" animation, getting stuck near the content boundary before breaking free.
 * - Mobile (no sidebar): Companion slides in from the left edge with a simpler animation.
 * 
 * During the entry animation on desktop, the companion is rendered inside a clipping 
 * container that matches the main content area bounds, creating the effect of emerging 
 * from behind the sidebar. After the animation completes, it switches to unrestricted 
 * global rendering.
 */

import { useMemo, useState, useEffect, useCallback } from 'react';

import { useBlobbiCompanion } from '../hooks/useBlobbiCompanion';
import { BlobbiCompanion } from './BlobbiCompanion';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateEntryPosition, calculateRestingPosition, calculateGroundY } from '../utils/movement';

/**
 * Selector for the main content element in the DOM.
 * This targets the content column that has the left border on desktop (sidebar:border-l).
 */
const MAIN_CONTENT_SELECTOR = '.sidebar\\:border-l';

/**
 * Sidebar breakpoint in pixels (matches Tailwind config).
 * Below this width, there is no sidebar.
 */
const SIDEBAR_BREAKPOINT = 900;

interface ContentRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Global companion layer.
 * 
 * Renders the companion if:
 * - User is logged in
 * - User has set a current_companion in their profile
 * - The companion data is loaded
 * 
 * The companion appears from behind the left sidebar on route changes (desktop)
 * or slides in from the left edge (mobile) and roams the bottom of the viewport.
 */
export function BlobbiCompanionLayer() {
  const {
    companion,
    isVisible,
    state,
    motion,
    eyeOffset,
    isEntering,
    entryProgress,
    startDrag,
    updateDrag,
    endDrag,
  } = useBlobbiCompanion();
  
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Track viewport dimensions
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }));
  
  // Track whether we're on mobile (no sidebar)
  const isMobile = viewport.width < SIDEBAR_BREAKPOINT;
  
  // Track the real content area rect from the DOM (desktop only)
  const [contentRect, setContentRect] = useState<ContentRect | null>(null);
  
  // Measure the main content element from the DOM
  const measureContentRect = useCallback(() => {
    // On mobile, no need to measure - we don't use the sidebar animation
    if (window.innerWidth < SIDEBAR_BREAKPOINT) {
      setContentRect(null);
      return;
    }
    
    const contentElement = document.querySelector(MAIN_CONTENT_SELECTOR);
    if (contentElement) {
      const rect = contentElement.getBoundingClientRect();
      setContentRect({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    } else {
      // Fallback: use calculated values if element not found
      const layoutWidth = Math.min(window.innerWidth, config.layout.maxContentWidth);
      const layoutLeft = (window.innerWidth - layoutWidth) / 2;
      const contentLeft = layoutLeft + config.layout.sidebarWidth;
      setContentRect({
        left: contentLeft,
        top: 0,
        width: window.innerWidth - contentLeft,
        height: window.innerHeight,
      });
    }
  }, [config.layout.maxContentWidth, config.layout.sidebarWidth]);
  
  // Update viewport and content rect on resize
  useEffect(() => {
    const handleResize = () => {
      setViewport({
        width: window.innerWidth,
        height: window.innerHeight,
      });
      measureContentRect();
    };
    
    // Initial measurement
    measureContentRect();
    
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [measureContentRect]);
  
  // Re-measure when entering (route change might have different layout)
  useEffect(() => {
    if (isEntering) {
      // Small delay to ensure DOM has updated after route change
      const timer = setTimeout(measureContentRect, 10);
      return () => clearTimeout(timer);
    }
  }, [isEntering, measureContentRect]);
  
  // Calculate entry positions based on mobile vs desktop
  const entryStartPosition = useMemo(() => {
    const groundY = calculateGroundY(viewport.height, config.size, config);
    
    if (isMobile) {
      // Mobile: start just off the left edge of the screen
      return {
        x: -config.size,
        y: groundY,
      };
    }
    
    // Desktop: start behind the sidebar
    return calculateEntryPosition(viewport.width, viewport.height, config.size, config);
  }, [viewport.width, viewport.height, config, isMobile]);
  
  const entryEndPosition = useMemo(() => {
    const groundY = calculateGroundY(viewport.height, config.size, config);
    
    if (isMobile) {
      // Mobile: rest near the left side with some padding
      return {
        x: config.padding.left + 20,
        y: groundY,
      };
    }
    
    // Desktop: rest in the content area
    return calculateRestingPosition(viewport.width, viewport.height, config.size, config);
  }, [viewport.width, viewport.height, config, isMobile]);
  
  // Don't render anything if not visible
  if (!isVisible || !companion) {
    return null;
  }
  
  // Common companion props (shared between entry and normal modes)
  const baseCompanionProps = {
    companion,
    state,
    motion,
    eyeOffset,
    isEntering,
    entryProgress,
    entryStartPosition,
    entryEndPosition,
    onStartDrag: startDrag,
    onUpdateDrag: updateDrag,
    onEndDrag: endDrag,
    isMobile,
    // Pass the content boundary X for the stuck point calculation
    contentBoundaryX: contentRect?.left ?? 0,
  };
  
  // During entry animation on DESKTOP: render inside a clipping container
  // This creates the effect of emerging from behind the sidebar
  if (isEntering && !isMobile && contentRect) {
    return (
      <div 
        className="fixed pointer-events-none"
        style={{
          zIndex: 9999,
          // Position the clipping container at the content area
          left: contentRect.left,
          top: 0,
          // Extend to full viewport width/height to allow movement
          width: viewport.width - contentRect.left,
          height: viewport.height,
          // CRITICAL: This clips anything outside the container
          overflow: 'hidden',
        }}
        aria-hidden="true"
      >
        <div 
          className="pointer-events-auto relative"
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <BlobbiCompanion 
            {...baseCompanionProps}
            useAbsolutePositioning={true}
            positionOffset={{ x: contentRect.left, y: 0 }}
          />
        </div>
      </div>
    );
  }
  
  // Mobile entry OR after entry animation: render in unrestricted global layer
  // Uses fixed positioning so companion can move anywhere on screen
  // On mobile, no clipping is needed since we're just sliding in from the edge
  return (
    <div 
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-hidden="true"
    >
      <div className="pointer-events-auto">
        <BlobbiCompanion 
          {...baseCompanionProps}
          useAbsolutePositioning={false}
        />
      </div>
    </div>
  );
}
