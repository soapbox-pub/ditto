import { useId } from 'react';
import { cn } from '@/lib/utils';

interface PlanetButtonProps {
  className?: string;
}

/**
 * Filled planet-with-ring SVG shape used as the FAB background.
 *
 * Uses `useId()` to scope gradient/mask IDs so multiple instances can coexist
 * without ID collisions.
 */
export function PlanetButton({ className }: PlanetButtonProps) {
  const uid = useId();
  const gradientId = `${uid}-planet-gradient`;
  const ringGradientId = `${uid}-ring-gradient`;
  const maskId = `${uid}-planet-body-mask`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className={cn('absolute inset-0 w-full h-full', className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'hsl(var(--accent))' }} />
          <stop offset="100%" style={{ stopColor: 'hsl(var(--primary))' }} />
        </linearGradient>
        <linearGradient id={ringGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: 'hsl(var(--primary))' }} />
          <stop offset="100%" style={{ stopColor: 'hsl(var(--accent))' }} />
        </linearGradient>
        {/* Mask: white = visible, black = cut out.
            The middle arc (crossing through the circle) is stroked black
            so the ring appears to pass in front there. */}
        <mask id={maskId}>
          <circle cx="12" cy="12" r="8" fill="white" />
          <path
            d="M7.06 18.24 C9.1 17.82 11.57 16.88 14.05 15.5 C16.51 14.14 18.57 12.54 19.98 11.03"
            fill="none"
            stroke="black"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </mask>
      </defs>
      {/* Planet body with gradient fill, front-arc gap cut out */}
      <circle cx="12" cy="12" r="8" fill={`url(#${gradientId})`} mask={`url(#${maskId})`} />
      {/* Full ring as one continuous path */}
      <path
        d="M4.05 13 C2.35 14.8 1.55 16.5 2.25 17.5 C2.84 18.53 4.66 18.74 7.06 18.24 C9.1 17.82 11.57 16.88 14.05 15.5 C16.51 14.14 18.57 12.54 19.98 11.03 C21.66 9.22 22.4 7.54 21.75 6.5 C21.15 5.5 19.35 5.3 17.05 5.8"
        fill="none"
        stroke={`url(#${ringGradientId})`}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
