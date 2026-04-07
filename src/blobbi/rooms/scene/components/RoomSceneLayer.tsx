// src/blobbi/rooms/scene/components/RoomSceneLayer.tsx

/**
 * RoomSceneLayer — The composite room background behind Blobbi.
 *
 * Renders as an absolutely-positioned layer that fills its parent entirely.
 * Must be placed inside a container with `position: relative`.
 *
 * Visual structure (top to bottom):
 *   ┌──────────────────────────┐
 *   │                          │  Wall (~62% of height)
 *   │     WallLayer            │  Flat, front-facing
 *   │                          │
 *   ├──────────────────────────┤  Baseboard shadow
 *   │  ╲                    ╱  │
 *   │    ╲  FloorLayer    ╱    │  Floor (~38% of height)
 *   │      ╲            ╱      │  CSS 3D perspective transform
 *   └──────────────────────────┘
 *
 * The floor uses CSS `perspective` + `rotateX` with `transform-origin: top center`
 * to create depth. The top edge of the floor stays at the wall-floor junction
 * while the surface recedes into the distance, creating a natural room feel.
 *
 * The baseboard is a subtle shadow gradient at the junction line.
 *
 * A soft vignette around the edges adds subtle depth framing.
 */

import type { ResolvedRoomScene } from '../types';
import { WallLayer } from './WallLayer';
import { FloorLayer } from './FloorLayer';

interface RoomSceneLayerProps {
  scene: ResolvedRoomScene;
}

/** Wall occupies the top portion, floor the bottom. */
const WALL_PERCENT = 62;
const FLOOR_PERCENT = 100 - WALL_PERCENT; // 38%

export function RoomSceneLayer({ scene }: RoomSceneLayerProps) {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
      style={{ zIndex: 0 }}
    >
      {/* ── Wall Area ── */}
      <div
        className="absolute inset-x-0 top-0"
        style={{ height: `${WALL_PERCENT}%` }}
      >
        <WallLayer config={scene.wall} />
      </div>

      {/* ── Baseboard / Junction Shadow ── */}
      <div
        className="absolute inset-x-0"
        style={{
          top: `calc(${WALL_PERCENT}% - 6px)`,
          height: '12px',
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.04) 100%)',
          zIndex: 2,
        }}
      />

      {/* ── Floor Area with Perspective ── */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          top: `${WALL_PERCENT}%`,
          height: `${FLOOR_PERCENT}%`,
          // Perspective container: the vanishing point is at the center
          // of the wall-floor junction line.
          perspective: '500px',
          perspectiveOrigin: '50% 0%',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            // Tilt the floor plane backward to create depth.
            // transform-origin at top center keeps the junction line fixed.
            transformOrigin: 'top center',
            transform: 'rotateX(28deg)',
            // Extend 80% taller to cover any gaps from the perspective
            // foreshortening at the bottom edge.
            height: '180%',
          }}
        >
          <FloorLayer config={scene.floor} />
        </div>
      </div>

      {/* ── Soft Vignette ── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 85% 70% at 50% 45%, transparent 55%, rgba(0,0,0,0.06) 100%)',
          zIndex: 3,
        }}
      />
    </div>
  );
}
