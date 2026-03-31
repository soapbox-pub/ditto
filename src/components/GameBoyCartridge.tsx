import { useMemo } from 'react';
import { Blocks } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Cartridge color palettes inspired by real Game Boy cartridge variations.
 * Each palette defines shell, label background, accent stripe, and text colors.
 */
const CARTRIDGE_PALETTES = [
  { shell: '#a0a0a0', shellDark: '#8a8a8a', shellLight: '#b8b8b8', label: '#f0ece0', labelBorder: '#d4d0c4', accent: '#c23028', accentDark: '#9e201a', text: '#3a3a3a' }, // Classic DMG grey
  { shell: '#5c6b84', shellDark: '#4a576d', shellLight: '#7483a0', label: '#e8e4d8', labelBorder: '#ccc8bc', accent: '#3a6fa8', accentDark: '#285890', text: '#2a3548' }, // Pocket blue
  { shell: '#6b8a5c', shellDark: '#587546', shellLight: '#82a474', label: '#eae8d4', labelBorder: '#ceccb8', accent: '#4a8f3c', accentDark: '#387830', text: '#2a3a20' }, // Green (Zelda edition)
  { shell: '#8a7260', shellDark: '#745e4e', shellLight: '#a48c78', label: '#f0e8dc', labelBorder: '#d4ccc0', accent: '#c47832', accentDark: '#a86020', text: '#3a2e22' }, // Warm brown
  { shell: '#886478', shellDark: '#725062', shellLight: '#a07c90', label: '#f0e4ec', labelBorder: '#d4c8d0', accent: '#b84878', accentDark: '#983860', text: '#3a2030' }, // Pink/berry
  { shell: '#607888', shellDark: '#4e6474', shellLight: '#7894a4', label: '#e4ecf0', labelBorder: '#c8d0d4', accent: '#3888a8', accentDark: '#287090', text: '#1e3040' }, // Teal
  { shell: '#8a8660', shellDark: '#74704e', shellLight: '#a4a078', label: '#f0eee0', labelBorder: '#d4d2c4', accent: '#a09830', accentDark: '#888020', text: '#3a3820' }, // Gold
  { shell: '#746488', shellDark: '#605074', shellLight: '#8c7ca4', label: '#ece4f0', labelBorder: '#d0c8d4', accent: '#7848a8', accentDark: '#603890', text: '#2e2040' }, // Purple (GBC style)
] as const;

interface GameBoyCartridgeProps {
  /** App icon URL. */
  icon?: string;
  /** App name for the label. */
  name?: string;
  /** Deterministic seed for color variation. */
  seed?: string;
  /** Additional class names on the outer button. */
  className?: string;
  /** Click handler. */
  onClick?: () => void;
}

/** Derive a stable palette index from a seed string using djb2 hash. */
function paletteFromSeed(seed: string): typeof CARTRIDGE_PALETTES[number] {
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return CARTRIDGE_PALETTES[Math.abs(hash) % CARTRIDGE_PALETTES.length];
}

/**
 * A realistic Game Boy DMG-style cartridge that displays a webxdc app.
 * Proportions and details modeled after an original Nintendo Game Boy cartridge.
 *
 * ViewBox: 220 x 264 — roughly matches real cartridge aspect ratio (~5:6).
 */
export function GameBoyCartridge({ icon, name, seed, className, onClick }: GameBoyCartridgeProps) {
  const p = useMemo(() => seed ? paletteFromSeed(seed) : CARTRIDGE_PALETTES[0], [seed]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative block w-full max-w-[200px] mx-auto cursor-pointer',
        'transition-all duration-200 ease-out',
        'hover:-translate-y-1 active:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg',
        className,
      )}
    >
      <svg
        viewBox="0 0 220 264"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-md transition-[filter] duration-200 group-hover:drop-shadow-lg"
      >
        <defs>
          {/* Top-to-bottom sheen for plastic depth */}
          <linearGradient id={`topShade-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.12" />
            <stop offset="100%" stopColor="black" stopOpacity="0.06" />
          </linearGradient>
          {/* Label paper gradient */}
          <linearGradient id={`labelGrad-${seed}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity="0.3" />
            <stop offset="100%" stopColor="black" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {/* ========== MAIN SHELL (single path with integrated notches) ========== */}
        {/*
          Real DMG cartridge silhouette: the side notches are part of the shell,
          not separate blocks. The shell widens at the notch area then steps
          inward below it.

          Coordinates (left to right, top to bottom):
            - Notch columns: x=14..30 (left), x=190..206 (right)
            - Main body: x=30..190
            - Notch top: y=6 (above main shell top for the tab)
            - Notch bottom: y=56
            - Body top: y=12
            - Body bottom: y=252
        */}
        <path
          d={[
            // Start at top-left of left notch
            'M18,6', 'Q14,6 14,10',
            // Left notch outer edge down
            'L14,52', 'Q14,56 18,56',
            // Step inward to main body left edge
            'L26,56', 'Q30,56 30,52',
            // Main body left edge down to bottom
            'L30,246', 'Q30,252 36,252',
            // Bottom edge
            'L184,252', 'Q190,252 190,246',
            // Main body right edge up to notch step
            'L190,52', 'Q190,56 194,56',
            // Step outward to right notch
            'L202,56', 'Q206,56 206,52',
            // Right notch outer edge up
            'L206,10', 'Q206,6 202,6',
            // Top edge
            'Z',
          ].join(' ')}
          fill={p.shell}
        />

        {/* Plastic sheen overlay (same path as clip) */}
        <path
          d="M18,6 Q14,6 14,10 L14,52 Q14,56 18,56 L26,56 Q30,56 30,52 L30,246 Q30,252 36,252 L184,252 Q190,252 190,246 L190,52 Q190,56 194,56 L202,56 Q206,56 206,52 L206,10 Q206,6 202,6 Z"
          fill={`url(#topShade-${seed})`}
        />

        {/* Light edge (left + top) */}
        <path
          d="M14,52 L14,10 Q14,6 18,6 L202,6 Q206,6 206,10"
          fill="none"
          stroke={p.shellLight}
          strokeWidth="1"
          opacity="0.4"
        />
        {/* Shadow edge (right + bottom) */}
        <path
          d="M190,246 Q190,252 184,252 L36,252 Q30,252 30,246"
          fill="none"
          stroke={p.shellDark}
          strokeWidth="1"
          opacity="0.35"
        />

        {/* ========== TOP GRIP SECTION ========== */}
        {/* Recessed grip strip across the full width (including notch columns) */}
        <rect x="14" y="6" width="192" height="30" rx="4" ry="4" fill={p.shellDark} opacity="0.5" />

        {/* Grip ridge lines — only between the notch columns */}
        {[12, 17, 22, 27, 32].map((y) => (
          <line
            key={y}
            x1="36"
            y1={y}
            x2="184"
            y2={y}
            stroke={p.shellLight}
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.3"
          />
        ))}

        {/* ========== NOTCH INNER DETAIL ========== */}
        {/* Subtle inset shadow on left notch channel */}
        <rect x="16" y="10" width="12" height="42" rx="2" fill={p.shellDark} opacity="0.15" />
        {/* Subtle inset shadow on right notch channel */}
        <rect x="192" y="10" width="12" height="42" rx="2" fill={p.shellDark} opacity="0.15" />

        {/* ========== LABEL STICKER ========== */}
        {/* Label background — inset within the main body column (x=30..190) */}
        <rect x="38" y="46" width="144" height="148" rx="3" fill={p.label} />
        {/* Label paper sheen */}
        <rect x="38" y="46" width="144" height="148" rx="3" fill={`url(#labelGrad-${seed})`} />
        {/* Label border (slightly worn look) */}
        <rect x="38" y="46" width="144" height="148" rx="3" fill="none" stroke={p.labelBorder} strokeWidth="0.75" />

        {/* ========== ICON AREA ========== */}
        {/* Icon window — centered on the label */}
        <rect x="66" y="56" width="88" height="84" rx="6" fill="white" opacity="0.5" />
        <rect x="66" y="56" width="88" height="84" rx="6" fill="none" stroke={p.labelBorder} strokeWidth="0.5" />

        {/* ========== APP NAME ON LABEL ========== */}
        {name && (
          <text
            x="110"
            y="162"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={p.text}
            fontSize="11"
            fontFamily="Inter Variable, Inter, system-ui, sans-serif"
            fontWeight="700"
            letterSpacing="0.3"
          >
            {name.length > 18 ? name.slice(0, 16) + '\u2026' : name}
          </text>
        )}

        {/* Thin accent line under the name */}
        <line x1="66" y1="174" x2="154" y2="174" stroke={p.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />

        {/* ========== BOTTOM SECTION ========== */}
        {/* Accent stripe — the colored bar like on real cartridges */}
        <rect x="38" y="200" width="144" height="8" rx="4" fill={p.accent} />
        {/* Stripe highlight */}
        <rect x="38" y="200" width="144" height="4" rx="2" fill="white" opacity="0.15" />

        {/* "WEBXDC" embossed text */}
        <text
          x="110"
          y="228"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={p.shellDark}
          fontSize="9"
          fontFamily="Inter Variable, Inter, system-ui, sans-serif"
          fontWeight="800"
          letterSpacing="3"
          opacity="0.35"
        >
          WEBXDC
        </text>

        {/* Screw indent (single, centered, like real DMG carts — back side, but adds realism) */}
        <circle cx="110" cy="244" r="4.5" fill={p.shellDark} opacity="0.25" />
        <circle cx="110" cy="244" r="2" fill={p.shell} opacity="0.3" />
        {/* Cross indentation */}
        <line x1="108" y1="244" x2="112" y2="244" stroke={p.shellDark} strokeWidth="0.6" opacity="0.3" />
        <line x1="110" y1="242" x2="110" y2="246" stroke={p.shellDark} strokeWidth="0.6" opacity="0.3" />

        {/* ========== BOTTOM EDGE CONNECTOR ========== */}
        {/* The recessed slot where gold contacts sit */}
        <rect x="50" y="252" width="120" height="10" rx="2" fill={p.shellDark} opacity="0.35" />
        {/* Gold contact pins */}
        {Array.from({ length: 14 }, (_, i) => 54 + i * 8).map((x) => (
          <rect key={x} x={x} y="253" width="4.5" height="8" rx="0.5" fill="#c0a840" opacity="0.45" />
        ))}
      </svg>

      {/* ========== OVERLAID ICON (HTML for img support) ========== */}
      <div
        className="absolute flex items-center justify-center rounded-md overflow-hidden"
        style={{
          /* Aligned to the icon window: x=66, y=56, w=88, h=84 in 220x264 viewBox */
          left: 'calc(66 / 220 * 100%)',
          top: 'calc(56 / 264 * 100%)',
          width: 'calc(88 / 220 * 100%)',
          height: 'calc(84 / 264 * 100%)',
        }}
      >
        {icon ? (
          <img
            src={icon}
            alt={name ?? 'Webxdc App'}
            className="size-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center size-full bg-muted/60">
            <Blocks className="size-8 text-muted-foreground/60" />
          </div>
        )}
      </div>

      {/* Hover shimmer */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-lg',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-200',
          'bg-gradient-to-tr from-transparent via-white/[0.07] to-transparent',
        )}
      />
    </button>
  );
}
