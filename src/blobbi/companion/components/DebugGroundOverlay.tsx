/**
 * DebugGroundOverlay — Debug-only visual overlay for ground contact debugging.
 *
 * Shows horizontal lines indicating:
 *   - Container bottom (where Blobbi's container ends)
 *   - Viewport bottom minus padding (target ground position)
 *   - Entry animation type and phase (during entry)
 *
 * Enabled by setting DEBUG_GROUND_CONTACT = true in BlobbiCompanionLayer.
 */

import type { EntryState } from '../types/companion.types';

interface DebugGroundOverlayProps {
  groundY: number;
  size: number;
  viewportHeight: number;
  paddingBottom: number;
  isEntering: boolean;
  entryState: EntryState;
}

export function DebugGroundOverlay({
  groundY,
  size,
  viewportHeight,
  paddingBottom,
  isEntering,
  entryState,
}: DebugGroundOverlayProps) {
  return (
    <>
      {/* Ground line where Blobbi's CONTAINER bottom should be */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: groundY + size,
          height: 2,
          backgroundColor: 'red',
          zIndex: 10002,
        }}
      />
      <div
        style={{
          position: 'fixed',
          right: 10,
          top: groundY + size + 4,
          color: 'red',
          fontSize: 12,
          fontWeight: 'bold',
          zIndex: 10002,
          backgroundColor: 'white',
          padding: '2px 4px',
        }}
      >
        Container bottom (groundY + size = {Math.round(groundY + size)}px)
      </div>
      {/* Viewport bottom minus padding */}
      <div
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          top: viewportHeight - paddingBottom,
          height: 2,
          backgroundColor: 'blue',
          zIndex: 10002,
        }}
      />
      <div
        style={{
          position: 'fixed',
          right: 10,
          top: viewportHeight - paddingBottom + 4,
          color: 'blue',
          fontSize: 12,
          fontWeight: 'bold',
          zIndex: 10002,
          backgroundColor: 'white',
          padding: '2px 4px',
        }}
      >
        Viewport - padding = {viewportHeight - paddingBottom}px (Target ground)
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
  );
}
