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
          {/* Subtle plastic grain texture */}
          <filter id={`grain-${seed}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" result="noise" />
            <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
            <feBlend in="SourceGraphic" in2="grey" mode="overlay" />
          </filter>
          {/* Top shadow for depth */}
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

        {/* ========== MAIN SHELL ========== */}
        {/* Outer cartridge body */}
        <rect x="14" y="12" width="192" height="240" rx="6" ry="6" fill={p.shell} />

        {/* Plastic sheen overlay */}
        <rect x="14" y="12" width="192" height="240" rx="6" ry="6" fill={`url(#topShade-${seed})`} />

        {/* Subtle edge highlight (left + top) */}
        <path
          d="M20,252 L20,18 Q20,12 26,12 L200,12"
          fill="none"
          stroke={p.shellLight}
          strokeWidth="1"
          opacity="0.5"
        />
        {/* Shadow edge (right + bottom) */}
        <path
          d="M200,12 Q206,12 206,18 L206,246 Q206,252 200,252 L20,252"
          fill="none"
          stroke={p.shellDark}
          strokeWidth="1"
          opacity="0.4"
        />

        {/* ========== TOP GRIP SECTION ========== */}
        {/* Recessed grip area */}
        <rect x="14" y="12" width="192" height="28" rx="6" ry="6" fill={p.shellDark} />
        <rect x="14" y="28" width="192" height="12" fill={p.shellDark} />

        {/* Grip ridge lines */}
        {[18, 22, 26, 30, 34].map((y) => (
          <line
            key={y}
            x1="30"
            y1={y}
            x2="190"
            y2={y}
            stroke={p.shell}
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.6"
          />
        ))}

        {/* ========== SIDE NOTCHES (lock slots) ========== */}
        {/* Left notch */}
        <rect x="10" y="12" width="16" height="50" rx="3" fill={p.shellDark} />
        <rect x="12" y="14" width="12" height="46" rx="2" fill={p.shell} opacity="0.5" />

        {/* Right notch */}
        <rect x="194" y="12" width="16" height="50" rx="3" fill={p.shellDark} />
        <rect x="196" y="14" width="12" height="46" rx="2" fill={p.shell} opacity="0.5" />

        {/* ========== LABEL STICKER ========== */}
        {/* Label background */}
        <rect x="28" y="48" width="164" height="148" rx="3" fill={p.label} />
        {/* Label paper sheen */}
        <rect x="28" y="48" width="164" height="148" rx="3" fill={`url(#labelGrad-${seed})`} />
        {/* Label border (slightly worn look) */}
        <rect x="28" y="48" width="164" height="148" rx="3" fill="none" stroke={p.labelBorder} strokeWidth="0.75" />

        {/* ========== ICON AREA ========== */}
        {/* Icon window — rounded rect cutout on the label */}
        <rect x="62" y="60" width="96" height="88" rx="6" fill="white" opacity="0.5" />
        <rect x="62" y="60" width="96" height="88" rx="6" fill="none" stroke={p.labelBorder} strokeWidth="0.5" />

        {/* ========== APP NAME ON LABEL ========== */}
        {name && (
          <text
            x="110"
            y="170"
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
        <line x1="60" y1="182" x2="160" y2="182" stroke={p.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />

        {/* ========== BOTTOM SECTION ========== */}
        {/* Accent stripe — the colored bar like on real cartridges */}
        <rect x="28" y="202" width="164" height="8" rx="4" fill={p.accent} />
        {/* Stripe highlight */}
        <rect x="28" y="202" width="164" height="4" rx="2" fill="white" opacity="0.15" />

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
        {/* The gold contacts visible at the bottom */}
        <rect x="44" y="252" width="132" height="12" rx="2" fill={p.shellDark} opacity="0.4" />
        {/* Contact pin lines */}
        {Array.from({ length: 16 }, (_, i) => 52 + i * 7.5).map((x) => (
          <rect key={x} x={x} y="253" width="4" height="10" rx="0.5" fill="#b8a040" opacity="0.5" />
        ))}
      </svg>

      {/* ========== OVERLAID ICON (HTML for img support) ========== */}
      <div
        className="absolute flex items-center justify-center rounded-md overflow-hidden"
        style={{
          /* Aligned to the icon window: x=62, y=60, w=96, h=88 in 220x264 viewBox */
          left: 'calc(62 / 220 * 100%)',
          top: 'calc(60 / 264 * 100%)',
          width: 'calc(96 / 220 * 100%)',
          height: 'calc(88 / 264 * 100%)',
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
