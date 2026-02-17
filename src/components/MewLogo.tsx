import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface MewLogoProps {
  className?: string;
  size?: number;
}

/** The Mew logo rendered from the custom PNG asset. */
export function MewLogo({ className, size = 40 }: MewLogoProps) {
  const { theme } = useTheme();
  
  // Apply filters to make logo readable in light themes
  const getFilterStyle = () => {
    switch (theme) {
      case 'light':
        // Dark grey filter for light theme
        return 'brightness-0 saturate-100 invert(20%) sepia(0%) saturate(0%) brightness(95%) contrast(90%)';
      case 'pink':
        // Dark pink filter for pink theme
        return 'brightness-0 saturate-100 invert(20%) sepia(80%) saturate(2000%) hue-rotate(310deg) brightness(80%) contrast(95%)';
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
      className={cn('object-contain transition-all duration-300', getFilterStyle(), className)}
    />
  );
}
