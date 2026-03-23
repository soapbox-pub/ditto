/**
 * BlobbiCompanionLayer
 * 
 * Global layer component that renders the companion above all other content.
 * This should be placed at the root level of the app.
 */

import { useMemo } from 'react';

import { useBlobbiCompanion } from '../hooks/useBlobbiCompanion';
import { BlobbiCompanion } from './BlobbiCompanion';
import { DEFAULT_COMPANION_CONFIG } from '../core/companionConfig';
import { calculateEntryPosition, calculateRestingPosition } from '../utils/movement';

/**
 * Global companion layer.
 * 
 * Renders the companion if:
 * - User is logged in
 * - User has set a current_companion in their profile
 * - The companion data is loaded
 * 
 * The companion appears from behind the left sidebar on route changes
 * and roams the bottom of the viewport.
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
  
  // Calculate viewport dimensions
  const viewport = useMemo(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
    height: typeof window !== 'undefined' ? window.innerHeight : 768,
  }), []);
  
  // Calculate entry positions
  const entryStartPosition = useMemo(() => 
    calculateEntryPosition(viewport.height, config.size, config),
    [viewport.height, config]
  );
  
  const entryEndPosition = useMemo(() =>
    calculateRestingPosition(viewport.width, viewport.height, config.size, config),
    [viewport.width, viewport.height, config]
  );
  
  // Don't render anything if not visible
  if (!isVisible || !companion) {
    return null;
  }
  
  return (
    <div 
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 9999 }}
      aria-hidden="true"
    >
      {/* Companion with pointer events enabled */}
      <div className="pointer-events-auto">
        <BlobbiCompanion
          companion={companion}
          state={state}
          motion={motion}
          eyeOffset={eyeOffset}
          isEntering={isEntering}
          entryProgress={entryProgress}
          entryStartPosition={entryStartPosition}
          entryEndPosition={entryEndPosition}
          onStartDrag={startDrag}
          onUpdateDrag={updateDrag}
          onEndDrag={endDrag}
        />
      </div>
    </div>
  );
}
