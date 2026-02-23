import { cn } from '@/lib/utils';

interface DittoLogoProps {
  className?: string;
  size?: number;
}

/** The Ditto logo rendered from the custom SVG asset. */
export function DittoLogo({ className, size = 40 }: DittoLogoProps) {
  return (
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
      }}
      className={cn(className)}
    />
  );
}
