/**
 * BlobbiCompanionLayer
 * 
 * Global layer component that renders the companion above all other content.
 * This should be placed at the root level of the app.
 * 
 * Entry animations are VERTICAL based on sidebar navigation direction:
 * - Navigating DOWN the sidebar: Blobbi falls from the top of the screen
 * - Navigating UP the sidebar: Blobbi rises from the bottom with inspection
 * 
 * No clipping is needed for vertical entry - the companion simply appears
 * from above or below the viewport.
 */

import { useMemo, useState, useEffect } from 'react';

import { useBlobbiCompanion } from '../hooks/useBlobbiCompanion';
import { BlobbiCompanion } from './BlobbiCompanion';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateGroundY } from '../utils/movement';

// DEBUG MODE - Set to true to debug ground contact
const DEBUG_GROUND_CONTACT = false;

/**
 * Global companion layer.
 * 
 * Renders the companion if:
 * - User is logged in
 * - User has set a current_companion in their profile
 * - The companion data is loaded
 * 
 * Entry animations are vertical:
 * - Falls from top when navigating DOWN the sidebar
 * - Rises from bottom (with inspection) when navigating UP the sidebar
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
    entryState,
    groundPosition,
    viewport,
    startDrag,
    updateDrag,
    endDrag,
  } = useBlobbiCompanion();
  
  const config = DEFAULT_COMPANION_CONFIG;
  
  // Don't render anything if not visible
  if (!isVisible || !companion) {
    return null;
  }
  
  // Companion props
  const companionProps = {
    companion,
    state,
    motion,
    eyeOffset,
    isEntering,
    entryProgress,
    entryState,
    groundPosition,
    viewport,
    onStartDrag: startDrag,
    onUpdateDrag: updateDrag,
    onEndDrag: endDrag,
  };
  
  // Calculate ground position for debug line
  const debugGroundY = calculateGroundY(viewport.height, config.size, config);
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-hidden="true"
    >
      {/* DEBUG: Visible ground line */}
      {DEBUG_GROUND_CONTACT && (
        <>
          {/* Ground line where Blobbi's CONTAINER bottom should be */}
          <div 
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: debugGroundY + config.size, // Container bottom
              height: 2,
              backgroundColor: 'red',
              zIndex: 10002,
            }}
          />
          {/* Label for the ground line */}
          <div
            style={{
              position: 'fixed',
              right: 10,
              top: debugGroundY + config.size + 4,
              color: 'red',
              fontSize: 12,
              fontWeight: 'bold',
              zIndex: 10002,
              backgroundColor: 'white',
              padding: '2px 4px',
            }}
          >
            Container bottom (groundY + size = {Math.round(debugGroundY + config.size)}px)
          </div>
          {/* Another line showing the actual viewport bottom minus padding */}
          <div 
            style={{
              position: 'fixed',
              left: 0,
              right: 0,
              top: viewport.height - config.padding.bottom,
              height: 2,
              backgroundColor: 'blue',
              zIndex: 10002,
            }}
          />
          <div
            style={{
              position: 'fixed',
              right: 10,
              top: viewport.height - config.padding.bottom + 4,
              color: 'blue',
              fontSize: 12,
              fontWeight: 'bold',
              zIndex: 10002,
              backgroundColor: 'white',
              padding: '2px 4px',
            }}
          >
            Viewport - padding = {viewport.height - config.padding.bottom}px (Target ground)
          </div>
          {/* Entry type indicator */}
          {isEntering && (
            <div
              style={{
                position: 'fixed',
                left: 10,
                top: 10,
                color: entryState.entryType === 'fall' ? 'orange' : 'green',
                fontSize: 14,
                fontWeight: 'bold',
                zIndex: 10002,
                backgroundColor: 'white',
                padding: '4px 8px',
                borderRadius: 4,
              }}
            >
              Entry: {entryState.entryType.toUpperCase()} | Phase: {entryState.phase}
            </div>
          )}
        </>
      )}
      <div className="pointer-events-auto">
        <BlobbiCompanion 
          {...companionProps}
          debugMode={DEBUG_GROUND_CONTACT}
        />
      </div>
    </div>
  );
}
