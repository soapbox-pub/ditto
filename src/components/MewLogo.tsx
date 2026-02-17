import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface MewLogoProps {
  className?: string;
  size?: number;
}

/** The Mew logo rendered from the custom PNG asset. */
export function MewLogo({ className, size = 40 }: MewLogoProps) {
  const { theme } = useTheme();
  
  return (
    <img
      src="/logo.png"
      alt="Mew"
      width={size}
      height={size}
      className={cn(
        'object-contain transition-all duration-300',
        theme === 'light' && 'brightness-0 saturate-100 invert(20%) sepia(0%) saturate(0%) brightness(95%) contrast(90%)',
        theme === 'pink' && 'brightness-0 saturate-100 invert(35%) sepia(90%) saturate(1500%) hue-rotate(310deg) brightness(100%) contrast(100%)',
        className
      )}
    />
  );
}
