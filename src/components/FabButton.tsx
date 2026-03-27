import { useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getAvatarShape, getEmojiMaskUrl } from '@/lib/avatarShape';

interface FabButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
  className?: string;
  title?: string;
}

/**
 * Reusable FAB that inherits the current user's avatar shape (emoji mask or
 * circle fallback), matching the FloatingComposeButton style exactly.
 */
export function FabButton({ onClick, icon, disabled, className = '', title }: FabButtonProps) {
  const { metadata } = useCurrentUser();
  const avatarShape = getAvatarShape(metadata);

  const shapeMaskStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!avatarShape) return undefined;
    const maskUrl = getEmojiMaskUrl(avatarShape);
    if (!maskUrl) return undefined;
    return {
      WebkitMaskImage: `url(${maskUrl})`,
      maskImage: `url(${maskUrl})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain' as string,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat' as string,
      WebkitMaskPosition: 'center',
      maskPosition: 'center' as string,
    };
  }, [avatarShape]);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative size-16 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none ${className}`}
      style={{ filter: 'drop-shadow(0 2px 8px hsl(var(--primary) / 0.25))' }}
    >
      <div
        className={`absolute inset-0 bg-primary ${shapeMaskStyle ? '' : 'rounded-full'}`}
        style={shapeMaskStyle}
      />
      <span className="absolute inset-0 flex items-center justify-center text-primary-foreground">
        {icon}
      </span>
    </button>
  );
}
