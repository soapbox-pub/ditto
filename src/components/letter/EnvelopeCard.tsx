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
 *     name            3h
 *
 * The closed flap shows the real StationeryBackground (images, palettes, emoji).
 * Below the V crease is the opaque paper body with corner folds and subtle shading.
 * Avatar wax seal at the V vertex.
 * Label: name left-aligned, shorthand time right-aligned.
 */

import { useMemo, useState } from 'react';
import { Clock, MoreHorizontal } from 'lucide-react';
import { useAuthor } from '@/hooks/useAuthor';
import { useDecryptLetter } from '@/hooks/useLetters';
import { genUserName } from '@/lib/genUserName';
import { resolveStationery, DEFAULT_STATIONERY_COLOR, type Letter } from '@/lib/letterTypes';
import { hexLuminance, darkenHex, lightenHex, blendHex } from '@/lib/colorUtils';
import { StationeryBackground } from './StationeryBackground';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';

interface EnvelopeCardProps {
  letter: Letter;
  mode: 'inbox' | 'sent';
  index: number;
  onClick: () => void;
  /** Hide name/timestamp label — used in notification context. */
  minimal?: boolean;
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

function deriveColors(bgHex: string, primaryHex: string) {
  const body = blendHex(bgHex, primaryHex, 0.08);
  const isDark = hexLuminance(body) < 0.45;
  return {
    body,
    bodyLight: lightenHex(body, 0.06),
    bodyDark: darkenHex(body, 0.06),
    stroke: darkenHex(body, 0.20),
    corner: darkenHex(body, 0.12),
    shadow: darkenHex(body, 0.30),
    text: isDark ? lightenHex(body, 0.55) : darkenHex(body, 0.55),
    textMuted: isDark ? lightenHex(body, 0.40) : darkenHex(body, 0.40),
  };
}

// ---------------------------------------------------------------------------
// Shorthand relative time — "3m", "2h", "5d", "3w", etc.
// ---------------------------------------------------------------------------

function shortTimeAgo(ts: number): string {
  const secs = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

// ---------------------------------------------------------------------------
// Proportions — from SendAnimation's calcDims at W=200
// ---------------------------------------------------------------------------

const V_PCT = 65;
const FLAP_Y_PCT = 15;

export function EnvelopeCard({ letter, mode, index, onClick, minimal }: EnvelopeCardProps) {
  const otherPubkey = mode === 'inbox' ? letter.sender : letter.recipient;
  const author = useAuthor(otherPubkey);
  const { data: decrypted } = useDecryptLetter(letter);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const displayName = author.data?.metadata?.name || author.data?.metadata?.display_name || genUserName(otherPubkey);
  const avatar = author.data?.metadata?.picture;
  const timeStr = shortTimeAgo(letter.timestamp);

  const stationery = decrypted?.stationery;
  const resolved = useMemo(() => resolveStationery(stationery ?? { color: DEFAULT_STATIONERY_COLOR }), [stationery]);
  const bgColor = resolved.color;
  const primaryColor = resolved.primaryColor ?? resolved.colors?.[0] ?? bgColor;
  const C = useMemo(() => deriveColors(bgColor, primaryColor), [bgColor, primaryColor]);

  const flapClip = `polygon(0% 0%, 100% 0%, 100% ${FLAP_Y_PCT}%, 50% ${V_PCT}%, 0% ${FLAP_Y_PCT}%)`;

  return (
    <>
    <button
      onClick={onClick}
      className="envelope-card group outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl w-full"
      style={{ '--entrance-delay': `${Math.min(index * 60, 300)}ms` } as React.CSSProperties}
      title={`${mode === 'inbox' ? 'From' : 'To'} ${displayName}`}
    >
      {/* Envelope — single rounded rect, ~1.59:1 like SendAnimation body */}
      <div
        className="envelope-body relative w-full overflow-hidden rounded-xl"
        style={{
          aspectRatio: '200 / 136',
          boxShadow: `0 4px 16px ${C.shadow}22, 0 2px 6px ${C.shadow}18`,
        }}
      >
        {/* Layer 0: Body paper — subtle gradient for depth */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(170deg, ${C.bodyLight} 0%, ${C.body} 45%, ${C.bodyDark} 100%)`,
          }}
        />

        {/* Layer 1: Closed flap = StationeryBackground clipped to flap shape */}
        <div
          className="absolute inset-0"
          style={{ clipPath: flapClip, zIndex: 1 }}
        >
          <StationeryBackground
            stationery={stationery}
            className="w-full h-full"
          />
        </div>

        {/* Layer 2: V-fold front pocket + crease lines + corner folds + shading */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 200 136"
          preserveAspectRatio="none"
          style={{ zIndex: 2 }}
        >
          <defs>
            <linearGradient id={`vfold-${letter.event.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.body} />
              <stop offset="100%" stopColor={C.bodyDark} />
            </linearGradient>
          </defs>

          {/* V-fold front pocket */}
          <path
            d={`M0,${FLAP_Y_PCT * 1.36} L92,${V_PCT * 1.36 - 10} Q100,${V_PCT * 1.36} 108,${V_PCT * 1.36 - 10} L200,${FLAP_Y_PCT * 1.36} L200,128 Q200,136 192,136 L8,136 Q0,136 0,128 Z`}
            fill={`url(#vfold-${letter.event.id})`}
          />
          {/* V crease line */}
          <path
            d={`M0,${FLAP_Y_PCT * 1.36} L92,${V_PCT * 1.36 - 10} Q100,${V_PCT * 1.36} 108,${V_PCT * 1.36 - 10} L200,${FLAP_Y_PCT * 1.36}`}
            fill="none"
            stroke={C.stroke}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.3"
          />
          {/* Corner fold diagonals */}
          <path d="M2,134 L70,70" stroke={C.corner} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.4" />
          <path d="M198,134 L130,70" stroke={C.corner} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.4" />
          {/* Subtle bottom edge shadow */}
          <rect x="0" y="132" width="200" height="4" rx="2" fill={C.shadow} opacity="0.06" />
        </svg>

        {/* Layer 4: Name + time inside the envelope bottom */}
        {!minimal && (
          <div
            className="absolute left-0 right-0 bottom-0 flex flex-col items-start px-2.5 pb-1.5 pt-0.5"
            style={{ zIndex: 3 }}
          >
            <span
              className="flex items-center gap-0.5 text-[9px] font-medium leading-tight"
              style={{ color: C.textMuted }}
            >
              <Clock className="w-2 h-2" />
              {timeStr}
            </span>
            <span
              className="text-[11px] font-semibold truncate leading-tight max-w-full"
              style={{ color: C.text }}
            >
              {displayName}
            </span>
          </div>
        )}

        {/* Layer 3: Avatar wax seal — positioned above V vertex */}
        <div
          className="absolute z-10"
          style={{
            left: '50%',
            top: `${V_PCT - 8}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="rounded-full transition-transform duration-200 group-hover:scale-110 overflow-hidden"
            style={{
              width: 40,
              height: 40,
              boxShadow: `0 3px 10px ${C.shadow}77, 0 1px 3px ${C.shadow}44, inset 0 1.5px 3px rgba(255,255,255,0.3)`,
              border: `3px solid ${darkenHex(primaryColor, 0.18)}`,
              background: `
                radial-gradient(ellipse at 35% 30%, rgba(255,255,255,0.22) 0%, transparent 50%),
                radial-gradient(ellipse at 65% 70%, rgba(0,0,0,0.12) 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, ${primaryColor}, ${darkenHex(primaryColor, 0.18)})
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
                  style={{ width: 22, height: 22, filter: 'brightness(0) invert(1) opacity(0.85)' }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Layer 5: Overflow menu trigger — lower right corner */}
        <div
          className="absolute bottom-1.5 right-1.5"
          style={{ zIndex: 20 }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setMoreMenuOpen(true); }}
            className="p-1 rounded-full transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
            style={{
              background: `${C.body}cc`,
              color: C.textMuted,
            }}
            title="More options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>

    </button>

    <NoteMoreMenu event={letter.event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
    </>
  );
}
