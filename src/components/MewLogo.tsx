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
        // Make logo darker and more saturated for light theme
        return 'brightness-0 saturate-100 invert(25%) sepia(15%) saturate(1200%) hue-rotate(220deg) brightness(95%) contrast(90%)';
      case 'pink':
        // Make logo darker with pink tint for pink theme
        return 'brightness-0 saturate-100 invert(35%) sepia(45%) saturate(1800%) hue-rotate(310deg) brightness(90%) contrast(95%)';
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
