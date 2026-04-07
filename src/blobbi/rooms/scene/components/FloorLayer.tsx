// src/blobbi/rooms/scene/components/FloorLayer.tsx

/**
 * FloorLayer — Renders the floor surface with visual depth.
 *
 * The floor receives CSS 3D perspective from its parent container
 * (RoomSceneLayer). This component renders the surface pattern only.
 * Different floor types produce different textures:
 *
 *   - wood:   Horizontal planks with grain lines and color variation
 *   - tile:   Checkerboard/grid pattern
 *   - carpet: Solid textured surface
 *
 * The component fills its parent container entirely.
 */

import { useMemo, useId } from 'react';
import { darkenHex, lightenHex, blendHex } from '@/lib/colorUtils';
import type { FloorConfig } from '../types';

interface FloorLayerProps {
  config: FloorConfig;
}

export function FloorLayer({ config }: FloorLayerProps) {
  const { type, color, accentColor } = config;

  switch (type) {
    case 'wood':
      return <WoodFloor color={color} accentColor={accentColor} />;
    case 'tile':
      return <TileFloor color={color} accentColor={accentColor} />;
    case 'carpet':
      return <CarpetFloor color={color} />;
    default:
      return <WoodFloor color={color} accentColor={accentColor} />;
  }
}

// ─── Wood Floor ───────────────────────────────────────────────────────────────

function WoodFloor({ color, accentColor }: { color: string; accentColor?: string }) {
  const patternId = useId();
  const grainColor = accentColor ?? darkenHex(color, 0.18);
  const plankGap = darkenHex(color, 0.3);

  // Alternate plank colors for natural variation
  const plankColors = useMemo(() => [
    color,
    lightenHex(color, 0.05),
    darkenHex(color, 0.04),
    blendHex(color, grainColor, 0.15),
    lightenHex(color, 0.03),
    darkenHex(color, 0.07),
  ], [color, grainColor]);

  return (
    <div className="absolute inset-0">
      {/* Base fill */}
      <div className="absolute inset-0" style={{ backgroundColor: color }} />

      {/* SVG plank pattern for realistic wood */}
      <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
        <defs>
          <pattern
            id={patternId}
            width="100%"
            height="240"
            patternUnits="userSpaceOnUse"
          >
            {/* 6 planks, each 38px tall with 2px gap */}
            {plankColors.map((pc, i) => (
              <g key={i}>
                {/* Plank body */}
                <rect
                  x="0"
                  y={i * 40}
                  width="100%"
                  height="38"
                  fill={pc}
                />
                {/* Subtle grain lines within plank */}
                <line
                  x1="0" y1={i * 40 + 12}
                  x2="100%" y2={i * 40 + 13}
                  stroke={grainColor}
                  strokeWidth="0.5"
                  opacity="0.15"
                />
                <line
                  x1="0" y1={i * 40 + 26}
                  x2="100%" y2={i * 40 + 25}
                  stroke={grainColor}
                  strokeWidth="0.3"
                  opacity="0.1"
                />
                {/* Plank gap line */}
                <rect
                  x="0"
                  y={i * 40 + 38}
                  width="100%"
                  height="2"
                  fill={plankGap}
                  opacity="0.4"
                />
              </g>
            ))}
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill={`url(#${CSS.escape(patternId)})`} />
      </svg>

      {/* Subtle light gradient: lighter near wall, darker in distance */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, transparent 30%, rgba(0,0,0,0.12) 100%)',
        }}
      />
    </div>
  );
}

// ─── Tile Floor ───────────────────────────────────────────────────────────────

function TileFloor({ color, accentColor }: { color: string; accentColor?: string }) {
  const groutColor = accentColor ?? darkenHex(color, 0.2);
  const altTile = lightenHex(color, 0.06);

  // Checkerboard tile pattern via CSS gradients
  const tilePattern = useMemo(() => {
    const size = 50; // tile size in px

    return {
      backgroundImage: [
        // Checkerboard: conic gradient creates four quadrants
        `conic-gradient(${altTile} 0.25turn, ${color} 0.25turn 0.5turn, ${altTile} 0.5turn 0.75turn, ${color} 0.75turn)`,
      ].join(', '),
      backgroundSize: `${size * 2}px ${size * 2}px`,
    };
  }, [color, altTile]);

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0" style={tilePattern} />

      {/* Grout lines overlay */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: [
            `repeating-linear-gradient(0deg, ${groutColor} 0px, ${groutColor} 1px, transparent 1px, transparent 50px)`,
            `repeating-linear-gradient(90deg, ${groutColor} 0px, ${groutColor} 1px, transparent 1px, transparent 50px)`,
          ].join(', '),
          opacity: 0.25,
        }}
      />

      {/* Light gradient for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 40%, rgba(0,0,0,0.10) 100%)',
        }}
      />
    </div>
  );
}

// ─── Carpet Floor ─────────────────────────────────────────────────────────────

function CarpetFloor({ color }: { color: string }) {
  return (
    <div className="absolute inset-0" style={{ backgroundColor: color }}>
      {/* Carpet texture: very subtle noise */}
      <div
        className="absolute inset-0 opacity-[0.06] mix-blend-multiply"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
          backgroundSize: '150px 150px',
        }}
      />

      {/* Light gradient for depth */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 40%, rgba(0,0,0,0.08) 100%)',
        }}
      />
    </div>
  );
}
