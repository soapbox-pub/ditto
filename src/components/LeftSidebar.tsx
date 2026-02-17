import { Link, useLocation } from 'react-router-dom';
import { Home, Bell, Search, Clapperboard, User, Wallet, Settings, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { MewLogo } from '@/components/MewLogo';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn } from '@/lib/utils';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
}

function NavItem({ to, icon, label, active }: NavItemProps) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-4 px-4 py-3 rounded-full transition-colors text-lg hover:bg-secondary/60',
        active ? 'font-bold' : 'font-normal text-muted-foreground',
      )}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

export function LeftSidebar() {
  const location = useLocation();
  const { user, metadata } = useCurrentUser();

  const navItems = [
    { to: '/', icon: <Home className="size-6" />, label: 'Home' },
    { to: '/notifications', icon: <Bell className="size-6" />, label: 'Notifications' },
    { to: '/search', icon: <Search className="size-6" />, label: 'Search' },
    { to: '/vines', icon: <Clapperboard className="size-6" />, label: 'Vines' },
    { to: '/profile', icon: <User className="size-6" />, label: 'Profile' },
    { to: '/wallet', icon: <Wallet className="size-6" />, label: 'Wallet' },
    { to: '/settings', icon: <Settings className="size-6" />, label: 'Settings' },
    { to: '/bookmarks', icon: <Bookmark className="size-6" />, label: 'Bookmarks' },
  ];

  return (
    <aside className="flex flex-col h-screen sticky top-0 py-3 px-4 w-[280px] shrink-0">
      {/* Logo */}
      <Link to="/" className="px-3 py-2 mb-1">
        <MewLogo size={36} />
      </Link>

      {/* Search bar - visible on xl */}
      <div className="px-2 py-2.5 mb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search"
            className="pl-10 py-2.5 rounded-full bg-secondary border-0 focus-visible:ring-1 focus-visible:ring-primary"
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 flex-1">
        {navItems.map((item) => (
          <NavItem
            key={item.to}
            to={item.to}
            icon={item.icon}
            label={item.label}
            active={location.pathname === item.to}
          />
        ))}

        {/* Compose button */}
        <Button
          className="w-full mt-4 rounded-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
          onClick={() => {
            // Scroll to the top compose area
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          <span>Compose</span>
        </Button>
      </nav>

      {/* User profile at bottom */}
      <div className="mt-auto pt-4">
        {user ? (
          <div className="flex items-center gap-3 p-3 rounded-full hover:bg-secondary/60 transition-colors cursor-pointer">
            <Avatar className="size-10 shrink-0">
              <AvatarImage src={metadata?.picture} alt={metadata?.name} />
              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                {(metadata?.name?.[0] || '?').toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-sm truncate">{metadata?.name || 'Anonymous'}</span>
              <span className="text-xs text-muted-foreground truncate">
                {metadata?.nip05 ? `@${metadata.nip05}` : ''}
              </span>
            </div>
          </div>
        ) : (
          <LoginArea className="w-full flex flex-col" />
        )}
      </div>
    </aside>
  );
}
