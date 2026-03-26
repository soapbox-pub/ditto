/**
 * EnvelopeCard — Wii Mail-inspired envelope tile for the letters grid.
 *
 * A sealed envelope — single rounded rectangle:
 *
 *   ┌────────────────────┐
 *   │                    │  ← closed flap = StationeryBackground
 *   │   (stationery)     │
 *   │         ╲   ╱      │
 *   │──────────╲╱────────│  ← V crease line
 *   │         [seal]     │
 *   │    ╱           ╲   │  ← V-fold body = opaque paper
 *   │  ╱               ╲ │
 *   └────────────────────┘
 *
 * The closed flap shows the real StationeryBackground (images, palettes, emoji).
 * Below the V crease is the opaque paper body with corner folds.
 * Avatar wax seal at the V vertex.
 */

import { useMemo } from 'react';
import { useAuthor } from '@/hooks/useAuthor';
import { useDecryptLetter } from '@/hooks/useLetters';
import { genUserName } from '@/lib/genUserName';
import { resolveStationery, type Letter } from '@/lib/letterTypes';
import { hexToRgb, rgbToHex } from '@/lib/colorUtils';
import { StationeryBackground } from './StationeryBackground';
import { formatDistanceToNow } from 'date-fns';

interface EnvelopeCardProps {
  letter: Letter;
  mode: 'inbox' | 'sent';
  index: number;
  onClick: () => void;
}

// ---------------------------------------------------------------------------
// Color helpers — matches SendAnimation
// ---------------------------------------------------------------------------

function blendHex(hex1: string, hex2: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex1);
  const [r2, g2, b2] = hexToRgb(hex2);
  return rgbToHex(
    Math.round(r1 + (r2 - r1) * amount),
    Math.round(g1 + (g2 - g1) * amount),
    Math.round(b1 + (b2 - b1) * amount),
  );
}

function darkenHex(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const dark = (c: number) => Math.max(0, Math.round(c * (1 - amount)));
  return rgbToHex(dark(r), dark(g), dark(b));
}

function deriveColors(bgHex: string, primaryHex: string) {
  const body = blendHex(bgHex, primaryHex, 0.08);
  return {
    body,
    stroke: darkenHex(body, 0.20),
    corner: darkenHex(body, 0.12),
  };
}

// ---------------------------------------------------------------------------
// Proportions — from SendAnimation's calcDims at W=200
//   envH=126, flapY=19 (V-fold starts), vY=82 (V vertex)
//   The body rect is the whole envelope. The closed flap covers from top to
//   the V crease. Below that is the V-fold front pocket.
//
//   V vertex at 65% from top of body (vY/envH = 82/126 ≈ 0.65)
//   V-fold starts at 15% from top (flapY/envH = 19/126 ≈ 0.15)
// ---------------------------------------------------------------------------

const V_PCT = 65;     // V vertex as % from top
const FLAP_Y_PCT = 15; // where V-fold / flap boundary line starts from top

export function EnvelopeCard({ letter, mode, index, onClick }: EnvelopeCardProps) {
  const otherPubkey = mode === 'inbox' ? letter.sender : letter.recipient;
  const author = useAuthor(otherPubkey);
  const { data: decrypted } = useDecryptLetter(letter);

  const displayName = author.data?.metadata?.name || genUserName(otherPubkey);
  const avatar = author.data?.metadata?.picture;
  const timeAgo = formatDistanceToNow(new Date(letter.timestamp * 1000), { addSuffix: true });

  const stationery = decrypted?.stationery;
  const resolved = useMemo(() => resolveStationery(stationery ?? { color: '#F5E6D3' }), [stationery]);
  const bgColor = resolved.color;
  const primaryColor = resolved.primaryColor ?? resolved.colors?.[0] ?? bgColor;
  const C = useMemo(() => deriveColors(bgColor, primaryColor), [bgColor, primaryColor]);

  // Closed flap shape: covers from top-left(0,0) → top-right(100%,0) → right at flapY(100%,15%)
  // → V vertex(50%,65%) → left at flapY(0,15%)
  // This is the back face of the SendAnimation flap after it closes down onto the body.
  const flapClip = `polygon(0% 0%, 100% 0%, 100% ${FLAP_Y_PCT}%, 50% ${V_PCT}%, 0% ${FLAP_Y_PCT}%)`;

  return (
    <button
      onClick={onClick}
      className="envelope-card group flex flex-col items-center gap-1.5 outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg"
      style={{ '--entrance-delay': `${index * 60}ms` } as React.CSSProperties}
      title={`${mode === 'inbox' ? 'From' : 'To'} ${displayName}`}
    >
      {/* Envelope — single rounded rect, ~1.59:1 like SendAnimation body */}
      <div
        className="envelope-body relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: '200 / 126',
          boxShadow: `0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)`,
        }}
      >
        {/* Layer 0: Body paper color */}
        <div className="absolute inset-0" style={{ backgroundColor: C.body }} />

        {/* Layer 1: Closed flap = StationeryBackground clipped to the flap shape */}
        <div
          className="absolute inset-0"
          style={{ clipPath: flapClip, zIndex: 1 }}
        >
          <StationeryBackground
            stationery={stationery}
            className="w-full h-full"
          />
        </div>

        {/* Layer 2: V-fold front pocket + crease lines + corner folds (SVG) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 200 126"
          preserveAspectRatio="none"
          style={{ zIndex: 2 }}
        >
          {/* V-fold front pocket — opaque paper below the V crease */}
          <path
            d={`M0,${FLAP_Y_PCT * 1.26} L92,${V_PCT * 1.26 - 10} Q100,${V_PCT * 1.26} 108,${V_PCT * 1.26 - 10} L200,${FLAP_Y_PCT * 1.26} L200,118 Q200,126 192,126 L8,126 Q0,126 0,118 Z`}
            fill={C.body}
          />
          {/* V crease line */}
          <path
            d={`M0,${FLAP_Y_PCT * 1.26} L92,${V_PCT * 1.26 - 10} Q100,${V_PCT * 1.26} 108,${V_PCT * 1.26 - 10} L200,${FLAP_Y_PCT * 1.26}`}
            fill="none"
            stroke={C.stroke}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.3"
          />
          {/* Corner fold diagonals */}
          <path d="M2,124 L70,63" stroke={C.corner} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.4" />
          <path d="M198,124 L130,63" stroke={C.corner} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.4" />
        </svg>

        {/* Layer 3: Avatar wax seal at V vertex */}
        <div
          className="absolute z-10"
          style={{
            left: '50%',
            top: `${V_PCT}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="rounded-full transition-transform duration-200 group-hover:scale-110 overflow-hidden"
            style={{
              width: 26,
              height: 26,
              boxShadow: `0 2px 6px ${C.stroke}55, inset 0 1px 2px rgba(255,255,255,0.25)`,
              border: `2px solid ${darkenHex(primaryColor, 0.15)}`,
              background: `
                radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.18) 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, ${primaryColor}, ${darkenHex(primaryColor, 0.15)})
              `,
            }}
          >
            {avatar ? (
              <img src={avatar} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <img
                  src="/logo.svg"
                  alt=""
                  style={{ width: 14, height: 14, filter: 'brightness(0) invert(1) opacity(0.8)' }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Label */}
      <div className="flex flex-col items-center gap-0 w-full px-0.5 min-w-0">
        <span className="text-xs font-medium text-foreground truncate w-full text-center leading-tight">
          {displayName}
        </span>
        <span className="text-[10px] text-muted-foreground leading-tight">
          {timeAgo}
        </span>
      </div>
    </button>
  );
}
