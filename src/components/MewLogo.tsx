import { cn } from '@/lib/utils';

interface MewLogoProps {
  className?: string;
  size?: number;
}

/** The Mew logo rendered from the custom PNG asset. */
export function MewLogo({ className, size = 40 }: MewLogoProps) {
  return (
    <img
      src="/logo.png"
      alt="Mew"
      width={size}
      height={size}
      className={cn('object-contain', className)}
    />
  );
}
