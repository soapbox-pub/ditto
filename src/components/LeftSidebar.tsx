import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Bell, Search, Clapperboard, BarChart3, MapPin, Palette, User, Wallet, Settings, Bookmark, UserPlus, LogOut, Check, Moon, Sun, Cat, Heart, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { MewLogo } from '@/components/MewLogo';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import LoginDialog from '@/components/auth/LoginDialog';
import SignupDialog from '@/components/auth/SignupDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useTheme } from '@/hooks/useTheme';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import type { Theme } from '@/contexts/AppContext';

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
  const navigate = useNavigate();
  const { user, metadata } = useCurrentUser();
  const { currentUser, otherUsers, setLogin } = useLoggedInAccounts();
  const { logout } = useLoginActions();
  const { theme, setTheme } = useTheme();
  const { feedSettings } = useFeedSettings();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const [signupDialogOpen, setSignupDialogOpen] = useState(false);
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);

  /** Map route name → lucide icon (size-6 for sidebar). */
  const ROUTE_ICONS: Record<string, React.ReactNode> = {
    vines: <Clapperboard className="size-6" />,
    polls: <BarChart3 className="size-6" />,
    treasures: <MapPin className="size-6" />,
    colors: <Palette className="size-6" />,
  };

  const navItems = useMemo(() => {
    const items = [
      { to: '/', icon: <Home className="size-6" />, label: 'Home' },
      { to: '/notifications', icon: <Bell className="size-6" />, label: 'Notifications' },
      { to: '/search', icon: <Search className="size-6" />, label: 'Search' },
    ];

    // Add enabled extra-kind links from the shared config
    for (const def of EXTRA_KINDS) {
      if (feedSettings[def.showKey]) {
        items.push({
          to: `/${def.route}`,
          icon: ROUTE_ICONS[def.route] ?? <Palette className="size-6" />,
          label: def.label,
        });
      }
    }

    items.push(
      { to: '/profile', icon: <User className="size-6" />, label: 'Profile' },
      { to: '/wallet', icon: <Wallet className="size-6" />, label: 'Wallet' },
      { to: '/settings', icon: <Settings className="size-6" />, label: 'Settings' },
      { to: '/bookmarks', icon: <Bookmark className="size-6" />, label: 'Bookmarks' },
    );
    return items;
  }, [feedSettings]);

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  };

  const handleLogin = () => {
    setLoginDialogOpen(false);
    setSignupDialogOpen(false);
  };

  const handleLogout = async () => {
    // Close popover first to avoid state update on unmounted component
    setAccountPopoverOpen(false);
    // Wait for logout to complete before navigation
    await logout();
    navigate('/');
  };

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'dark', label: 'Mew', icon: <Cat className="size-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { value: 'black', label: 'Black', icon: <Moon className="size-4" /> },
    { value: 'pink', label: 'Pink', icon: <Heart className="size-4" /> },
  ];

  return (
    <aside className="flex flex-col h-screen sticky top-0 py-3 px-4 w-[300px] shrink-0">
      {/* Logo */}
      <Link to="/" className="px-3 mb-1">
        <MewLogo size={48} />
      </Link>

      {/* Search bar - visible on xl */}
      <div className="px-2 py-3.5">
        <ProfileSearchDropdown
          placeholder="Search..."
          inputClassName="py-2.5"
          enableTextSearch
        />
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

        {/* Compose/Join button */}
        {user ? (
          <Button
            className="w-full mt-4 rounded-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            <span>Compose</span>
          </Button>
        ) : (
          <Button
            className="w-full mt-4 rounded-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={() => setLoginDialogOpen(true)}
          >
            <span>Join</span>
          </Button>
        )}
      </nav>

      {/* User profile at bottom — only when logged in */}
      {user && currentUser && (
        <div className="mt-auto pt-4">
          <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-3 p-3 rounded-full hover:bg-secondary/60 transition-colors cursor-pointer w-full text-left">
                <Avatar className="size-10 shrink-0">
                  <AvatarImage src={metadata?.picture} alt={metadata?.name} />
                  <AvatarFallback className="bg-primary/20 text-primary text-sm">
                    {(metadata?.name?.[0] || '?').toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="font-semibold text-sm truncate">{metadata?.name || 'Anonymous'}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {metadata?.nip05 ? `@${metadata.nip05}` : ''}
                  </span>
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              sideOffset={8}
              className="w-[260px] p-0 rounded-2xl shadow-xl border border-border overflow-hidden"
            >
              {/* Current user card */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11 shrink-0">
                    <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {getDisplayName(currentUser).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm truncate">{getDisplayName(currentUser)}</span>
                    {currentUser.metadata.nip05 && (
                      <span className="text-xs text-muted-foreground truncate">
                        @{currentUser.metadata.nip05}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Other accounts */}
              {otherUsers.length > 0 && (
                <div className="border-b border-border">
                  {otherUsers.map((account) => (
                    <button
                      key={account.id}
                      onClick={() => {
                        setLogin(account.id);
                        setAccountPopoverOpen(false);
                      }}
                      className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/60 transition-colors"
                    >
                      <Avatar className="size-9 shrink-0">
                        <AvatarImage src={account.metadata.picture} alt={getDisplayName(account)} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                          {getDisplayName(account).charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">{getDisplayName(account)}</span>
                        {account.metadata.nip05 && (
                          <span className="text-xs text-muted-foreground truncate">
                            @{account.metadata.nip05}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Theme selector */}
              <div className="border-b border-border py-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <Palette className="size-4 text-muted-foreground" />
                        <span>Theme</span>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        {themes.find(t => t.value === theme)?.icon}
                        <span className="text-xs">{themes.find(t => t.value === theme)?.label}</span>
                        <ChevronDown className="size-4" />
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-48">
                    <DropdownMenuLabel className="text-xs text-muted-foreground">Choose theme</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {themes.map((themeOption) => (
                      <DropdownMenuItem
                        key={themeOption.label}
                        onClick={() => setTheme(themeOption.value)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {themeOption.icon}
                          <span>{themeOption.label}</span>
                        </div>
                        {theme === themeOption.value && (
                          <Check className="size-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button
                  onClick={() => {
                    setAccountPopoverOpen(false);
                    setLoginDialogOpen(true);
                  }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 transition-colors"
                >
                  <UserPlus className="size-4 text-muted-foreground" />
                  <span>Add another account</span>
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut className="size-4" />
                  <span>Log out @{metadata?.name || genUserName(user.pubkey)}</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Login/Signup dialogs */}
      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={handleLogin}
        onSignupClick={() => setSignupDialogOpen(true)}
      />
      <SignupDialog
        isOpen={signupDialogOpen}
        onClose={() => setSignupDialogOpen(false)}
      />
    </aside>
  );
}
