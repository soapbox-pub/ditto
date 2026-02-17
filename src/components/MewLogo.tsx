import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface MewLogoProps {
  className?: string;
  size?: number;
}

/** The Mew logo rendered from the custom PNG asset. */
export function MewLogo({ className, size = 40 }: MewLogoProps) {
  const { theme } = useTheme();
  
  // Use opacity for light and pink themes
  const getOpacityClass = () => {
    switch (theme) {
      case 'pink':
        return 'opacity-60';
      case 'light':
        return 'opacity-70';
      default:
        return '';
    }
  };
  
  return (
    <img
      src="/logo.png"
      alt="Mew"
      width={size}
      height={size}
      className={cn('object-contain transition-opacity duration-300', getOpacityClass(), className)}
    />
  );
}
