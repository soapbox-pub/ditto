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

/**
 * Wall/floor split — 60% wall, 40% floor.
 *
 * A slightly generous floor area gives enough room for the perspective
 * transform to read as real depth without the floor feeling squished.
 * The 60/40 ratio works well across both desktop and mobile viewports.
 */
export const WALL_PERCENT = 60;
const FLOOR_PERCENT = 100 - WALL_PERCENT; // 40%

/**
 * Floor perspective settings.
 *
 * - `perspective: 600px` — gentle distance; avoids extreme distortion on
 *   mobile while still producing visible foreshortening on desktop.
 * - `rotateX(22deg)` — moderate tilt; enough to read as "floor receding"
 *   without fighting the Blobbi hero or bottom bar visually.
 * - `height: 160%` — overflow factor to cover the gap that forms at the
 *   bottom edge when the surface is foreshortened by the perspective.
 *   160% at 22deg is sufficient (cos(22deg) ~ 0.93).
 */
export const FLOOR_PERSPECTIVE = '600px';
export const FLOOR_TILT = 'rotateX(22deg)';
export const FLOOR_OVERFLOW = '160%';

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
          top: `calc(${WALL_PERCENT}% - 8px)`,
          height: '16px',
          background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.06) 30%, rgba(0,0,0,0.10) 50%, rgba(0,0,0,0.06) 70%, transparent 100%)',
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
          perspective: FLOOR_PERSPECTIVE,
          perspectiveOrigin: '50% 0%',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            // Tilt the floor plane backward to create depth.
            // transform-origin at top center keeps the junction line fixed.
            transformOrigin: 'top center',
            transform: FLOOR_TILT,
            // Extend taller to cover any gaps from the perspective
            // foreshortening at the bottom edge.
            height: FLOOR_OVERFLOW,
          }}
        >
          <FloorLayer config={scene.floor} />
        </div>
      </div>

      {/* ── Soft Vignette ── */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse 90% 75% at 50% 45%, transparent 50%, rgba(0,0,0,0.05) 100%)',
          zIndex: 3,
        }}
      />
    </div>
  );
}
