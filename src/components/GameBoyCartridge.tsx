import { useMemo } from 'react';
import { Blocks } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Cartridge color palette — each variation is a set of Tailwind-friendly HSL values. */
const CARTRIDGE_PALETTES = [
  { shell: '#8b8b8b', ridge: '#7a7a7a', label: '#e8e4d8', accent: '#c4392f' }, // Classic grey + red
  { shell: '#6b6b8a', ridge: '#5a5a79', label: '#e4e0d4', accent: '#4a6fa5' }, // Slate blue
  { shell: '#7a8b6b', ridge: '#697a5a', label: '#e8e4d0', accent: '#5a8f3c' }, // Forest green
  { shell: '#8b7a6b', ridge: '#7a695a', label: '#e4ddd4', accent: '#c47832' }, // Warm brown
  { shell: '#8b6b7a', ridge: '#7a5a69', label: '#e4d8e0', accent: '#a54a6f' }, // Dusty rose
  { shell: '#6b808b', ridge: '#5a6f7a', label: '#d8e0e4', accent: '#4a8fa5' }, // Teal
  { shell: '#8b8b6b', ridge: '#7a7a5a', label: '#e4e4d0', accent: '#a59f32' }, // Olive gold
  { shell: '#7b6b8b', ridge: '#6a5a7a', label: '#dcd4e4', accent: '#7a4aa5' }, // Purple
] as const;

interface GameBoyCartridgeProps {
  /** App icon URL. */
  icon?: string;
  /** App name for the label. */
  name?: string;
  /** Deterministic seed for color variation (e.g. UUID or URL hash). */
  seed?: string;
  /** Additional class names. */
  className?: string;
  /** Click handler. */
  onClick?: () => void;
}

/** Derive a stable palette index from a seed string. */
function paletteFromSeed(seed: string): typeof CARTRIDGE_PALETTES[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return CARTRIDGE_PALETTES[Math.abs(hash) % CARTRIDGE_PALETTES.length];
}

/**
 * A Game Boy cartridge component that displays a webxdc app icon on its label sticker.
 * Each cartridge gets a unique color based on the seed prop for visual variety.
 */
export function GameBoyCartridge({ icon, name, seed, className, onClick }: GameBoyCartridgeProps) {
  const palette = useMemo(() => seed ? paletteFromSeed(seed) : CARTRIDGE_PALETTES[0], [seed]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative block w-full max-w-[240px] mx-auto cursor-pointer',
        'transition-transform duration-300 ease-out',
        'hover:-translate-y-1.5 hover:scale-[1.02]',
        'active:translate-y-0 active:scale-[0.98]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg',
        className,
      )}
    >
      <svg
        viewBox="0 0 200 260"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto drop-shadow-md transition-[filter] duration-300 group-hover:drop-shadow-lg"
      >
        {/* === Cartridge body === */}
        {/* Main shell */}
        <rect x="16" y="0" width="168" height="240" rx="8" fill={palette.shell} />
        {/* Top grip ridges */}
        <rect x="16" y="0" width="168" height="32" rx="8" fill={palette.ridge} />
        {/* Ridge lines */}
        {[8, 14, 20, 26].map((y) => (
          <line key={y} x1="28" y1={y} x2="172" y2={y} stroke={palette.shell} strokeWidth="1.5" strokeLinecap="round" />
        ))}

        {/* Notch cutouts (top corners where cartridge slides into slot) */}
        <rect x="16" y="0" width="20" height="52" rx="4" fill={palette.ridge} />
        <rect x="164" y="0" width="20" height="52" rx="4" fill={palette.ridge} />

        {/* Inner edge bevel */}
        <rect x="20" y="4" width="160" height="232" rx="6" fill="none" stroke={palette.ridge} strokeWidth="0.5" opacity="0.4" />

        {/* === Label / Sticker area === */}
        <rect x="30" y="40" width="140" height="150" rx="4" fill={palette.label} />
        {/* Label border / worn edge */}
        <rect x="30" y="40" width="140" height="150" rx="4" fill="none" stroke={palette.ridge} strokeWidth="0.5" opacity="0.3" />

        {/* Subtle paper texture lines on label */}
        {[62, 82, 102, 122, 142, 162].map((y) => (
          <line key={y} x1="36" y1={y} x2="164" y2={y} stroke={palette.ridge} strokeWidth="0.2" opacity="0.15" />
        ))}

        {/* === Icon area (centered on label) === */}
        {/* Icon background circle */}
        <circle cx="100" cy="100" r="36" fill="white" opacity="0.6" />

        {/* === App name text on label === */}
        {name && (
          <text
            x="100"
            y="156"
            textAnchor="middle"
            fill={palette.ridge}
            fontSize="10"
            fontFamily="Inter Variable, Inter, system-ui, sans-serif"
            fontWeight="600"
            opacity="0.8"
          >
            {name.length > 20 ? name.slice(0, 18) + '...' : name}
          </text>
        )}

        {/* === Bottom section === */}
        {/* Accent stripe */}
        <rect x="30" y="196" width="140" height="6" rx="3" fill={palette.accent} opacity="0.8" />

        {/* Screw holes */}
        <circle cx="44" cy="220" r="5" fill={palette.ridge} opacity="0.5" />
        <circle cx="44" cy="220" r="2" fill={palette.shell} opacity="0.6" />
        <circle cx="156" cy="220" r="5" fill={palette.ridge} opacity="0.5" />
        <circle cx="156" cy="220" r="2" fill={palette.shell} opacity="0.6" />

        {/* Bottom label — "webxdc" branding */}
        <text
          x="100"
          y="224"
          textAnchor="middle"
          fill={palette.label}
          fontSize="8"
          fontFamily="Inter Variable, Inter, system-ui, sans-serif"
          fontWeight="700"
          letterSpacing="2"
          opacity="0.5"
        >
          WEBXDC
        </text>

        {/* Arrow indicator — "insert" direction */}
        <polygon points="95,238 100,244 105,238" fill={palette.ridge} opacity="0.3" />
      </svg>

      {/* === Overlaid icon (HTML element for img support) === */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          /* Position over the icon circle area in the SVG (circle at cx=100, cy=100, r=36 in a 200x260 viewBox) */
          left: '32%',
          top: '24.6%',
          width: '36%',
          height: '27.7%',
        }}
      >
        {icon ? (
          <img
            src={icon}
            alt={name ?? 'Webxdc App'}
            className="size-full rounded-xl object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex items-center justify-center size-full rounded-xl bg-muted/80">
            <Blocks className="size-8 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Hover shimmer overlay */}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-lg',
          'opacity-0 group-hover:opacity-100 transition-opacity duration-300',
          'bg-gradient-to-tr from-white/0 via-white/10 to-white/0',
        )}
      />
    </button>
  );
}
