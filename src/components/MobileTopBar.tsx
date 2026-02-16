import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { MewLogo } from '@/components/MewLogo';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { LoginArea } from '@/components/auth/LoginArea';

interface MobileTopBarProps {
  onAvatarClick: () => void;
}

export function MobileTopBar({ onAvatarClick }: MobileTopBarProps) {
  const { user, metadata } = useCurrentUser();

  return (
    <header className="sticky top-0 z-20 flex items-center px-3 h-10 bg-background/80 backdrop-blur-md border-b border-border sidebar:hidden">
      {/* Left: user avatar or login */}
      <div className="flex items-center justify-center w-7 shrink-0">
        {user ? (
          <button onClick={onAvatarClick} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1 focus:ring-offset-background">
            <Avatar className="size-7">
              <AvatarImage src={metadata?.picture} alt={metadata?.name} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {(metadata?.name?.[0] || '?').toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>
        ) : (
          <LoginArea className="scale-75 origin-left" />
        )}
      </div>

      {/* Center: Mew logo */}
      <div className="flex-1 flex items-center justify-center">
        <MewLogo size={22} />
      </div>

      {/* Right: spacer for symmetry */}
      <div className="w-7 shrink-0" />
    </header>
  );
}
