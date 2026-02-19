import { Link } from 'react-router-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { MewLogo } from '@/components/MewLogo';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface MobileTopBarProps {
  onAvatarClick: () => void;
}

export function MobileTopBar({ onAvatarClick }: MobileTopBarProps) {
  const { user, metadata } = useCurrentUser();

  return (
    <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border sidebar:hidden safe-area-top">
      <div className="flex items-center px-3 h-12">
        {/* Left: user avatar (empty when signed out) */}
        <div className="flex items-center justify-center w-7 shrink-0">
        {user && (
          <button onClick={onAvatarClick} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background">
            <Avatar className="size-7">
              <AvatarImage src={metadata?.picture} alt={metadata?.name} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {(metadata?.name?.[0] || '?').toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        )}
      </div>

      {/* Center: Mew logo */}
      <div className="flex-1 flex items-center justify-center">
        <Link to="/">
          <MewLogo size={28} />
        </Link>
      </div>

        {/* Right: spacer for symmetry */}
        <div className="w-7 shrink-0" />
      </div>
    </header>
  );
}
