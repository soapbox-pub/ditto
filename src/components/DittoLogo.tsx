import { useMemo } from 'react';

import { cn } from '@/lib/utils';

interface DittoLogoProps {
  className?: string;
  size?: number;
}

/** Whether the pixelated logo variant is shown this session. Decided once at module load. */
const isPixelated = Math.random() < 0.5;

/** The Ditto logo rendered from the custom SVG asset. Occasionally appears pixelated. */
export function DittoLogo({ className, size = 40 }: DittoLogoProps) {
  // Scale the pixel grid relative to logo size so it looks consistent across sizes.
  const pixelSize = useMemo(() => Math.max(2, Math.round(size / 8)), [size]);

  return (
    <>
      {isPixelated && (
        <svg width="0" height="0" aria-hidden="true" className="absolute">
          <defs>
            <filter id={`pixelate-${pixelSize}`}>
              {/* Shrink to a tiny grid then scale back up — creates mosaic effect */}
              <feFlood x="4" y="4" height="2" width="2" />
              <feComposite width={pixelSize * 2} height={pixelSize * 2} />
              <feTile result="a" />
              <feComposite in="SourceGraphic" in2="a" operator="in" />
              <feMorphology operator="dilate" radius={pixelSize} />
            </filter>
          </defs>
        </svg>
      )}
      <div
        role="img"
        aria-label="Ditto"
        style={{
          width: size,
          height: size,
          backgroundColor: 'hsl(var(--primary))',
          maskImage: 'url(/logo.svg)',
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          WebkitMaskImage: 'url(/logo.svg)',
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          ...(isPixelated ? { filter: `url(#pixelate-${pixelSize})` } : {}),
        }}
        className={cn(className)}
      />
    </>
  );
}
