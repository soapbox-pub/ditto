import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

interface MewLogoProps {
  className?: string;
  size?: number;
}

/** The Mew logo rendered from the custom PNG asset. */
export function MewLogo({ className, size = 40 }: MewLogoProps) {
  const { theme } = useTheme();
  
  // Define CSS filters for different themes
  const getFilterClass = () => {
    switch (theme) {
      case 'pink':
        return 'brightness-0 saturate-100 invert(48%) sepia(79%) saturate(2476%) hue-rotate(310deg) brightness(98%) contrast(98%)';
      case 'light':
        return 'brightness-0 saturate-100 invert(34%) sepia(85%) saturate(3048%) hue-rotate(245deg) brightness(95%) contrast(92%)';
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
      className={cn('object-contain transition-all duration-300', getFilterClass(), className)}
    />
  );
}
