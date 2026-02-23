import { useState, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Home, Bell, Search, Clapperboard, BarChart3, Palette, PartyPopper, Radio, FileText, User, Settings, Bookmark, UserPlus, LogOut, Check, Moon, Sun, Heart, ChevronDown } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { DittoLogo } from '@/components/DittoLogo';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/components/InitialSyncGate';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useTheme } from '@/hooks/useTheme';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { genUserName } from '@/lib/genUserName';
import { formatNip05Display } from '@/lib/nip05';
import { getProfileUrl } from '@/lib/profileUrl';
import { cn } from '@/lib/utils';
import type { Theme } from '@/contexts/AppContext';

interface NavItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  showIndicator?: boolean;
  onClick?: (e: React.MouseEvent) => void;
}

function NavItem({ to, icon, label, active, showIndicator, onClick }: NavItemProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        'flex items-center gap-4 px-4 py-3 rounded-full transition-colors text-lg hover:bg-secondary/60 relative',
        active ? 'font-bold' : 'font-normal text-muted-foreground',
      )}
    >
      <span className="relative">
        {icon}
        {showIndicator && (
          <span className="absolute top-0 right-0 size-2.5 bg-primary rounded-full" />
        )}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function LeftSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent, isLoading: isProfileLoading } = useCurrentUser();
  const { currentUser, otherUsers, setLogin } = useLoggedInAccounts();
  const { logout } = useLoginActions();
  const { theme, setTheme } = useTheme();
  const { feedSettings } = useFeedSettings();
  const hasUnread = useHasUnreadNotifications();
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);

  /** When already on the target route, scroll to top instead of navigating. */
  const scrollToTopIfCurrent = useCallback((to: string) => (e: React.MouseEvent) => {
    if (location.pathname === to) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  /** Map route name → lucide icon (size-6 for sidebar). */
  const ROUTE_ICONS: Record<string, React.ReactElement> = {
    vines: <Clapperboard className="size-6" />,
    polls: <BarChart3 className="size-6" />,
    treasures: <ChestIcon className="size-6" />,
    colors: <Palette className="size-6" />,
    packs: <PartyPopper className="size-6" />,
    streams: <Radio className="size-6" />,
    articles: <FileText className="size-6" />,
    decks: <CardsIcon className="size-6" />,
  };

  const navItems = useMemo(() => {
    const items = [
      { to: '/', icon: <Home className="size-6" />, label: 'Home' },
    ];

    // Only show notifications when logged in
    if (user) {
      items.push({ to: '/notifications', icon: <Bell className="size-6" />, label: 'Notifications' });
    }

    items.push({ to: '/search', icon: <Search className="size-6" />, label: 'Search' });

    // Add enabled extra-kind links from the shared config (skip feed-only items)
    for (const def of EXTRA_KINDS) {
      if (def.showKey && def.route && feedSettings[def.showKey]) {
        items.push({
          to: `/${def.route}`,
          icon: ROUTE_ICONS[def.route] ?? <Palette className="size-6" />,
          label: def.label,
        });
      }
    }

    // Only show Profile and Bookmarks when logged in
    if (user) {
      items.push(
        { to: getProfileUrl(user.pubkey, metadata), icon: <User className="size-6" />, label: 'Profile' },
        { to: '/bookmarks', icon: <Bookmark className="size-6" />, label: 'Bookmarks' },
      );
    }

    items.push(
      { to: '/settings', icon: <Settings className="size-6" />, label: 'Settings' },
    );
    return items;
  }, [feedSettings, user, metadata]);

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  };

  const handleLogin = () => {
    setLoginDialogOpen(false);
  };

  const handleLogout = async () => {
    // Close popover first to avoid state update on unmounted component
    setAccountPopoverOpen(false);
    // Wait for logout to complete before navigation
    await logout();
    navigate('/');
  };

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'dark', label: 'Dark', icon: <Palette className="size-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { value: 'black', label: 'Black', icon: <Moon className="size-4" /> },
    { value: 'pink', label: 'Pink', icon: <Heart className="size-4" /> },
  ];

  return (
    <aside className="flex flex-col h-screen sticky top-0 py-3 px-4 w-[300px] shrink-0">
      {/* Logo */}
      <Link to="/" className="px-3 mb-1" onClick={scrollToTopIfCurrent('/')}>
        <DittoLogo size={48} />
      </Link>

      {/* Search bar - visible on xl */}
      <div className="px-2 py-4">
        <ProfileSearchDropdown
          placeholder="Search..."
          inputClassName="py-3.5"
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
            showIndicator={item.to === '/notifications' && hasUnread}
            onClick={item.to === '/' ? scrollToTopIfCurrent('/') : undefined}
          />
        ))}

        {/* Compose/Join button */}
        {user ? (
          <>
            <Button
              className="w-full mt-4 rounded-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-primary-foreground"
              onClick={() => setComposeOpen(true)}
            >
              <span>Compose</span>
            </Button>
            <ReplyComposeModal open={composeOpen} onOpenChange={setComposeOpen} />
          </>
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
                {isProfileLoading ? (
                  <Skeleton className="size-10 shrink-0 rounded-full" />
                ) : (
                  <Avatar className="size-10 shrink-0">
                    <AvatarImage src={metadata?.picture} alt={metadata?.name} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {(metadata?.name?.[0] || '?').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                )}
                <div className="flex flex-col min-w-0 flex-1 gap-1">
                  {isProfileLoading ? (
                    <>
                      <Skeleton className="h-3.5 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </>
                  ) : (
                    <>
                      <span className="font-semibold text-sm truncate">
                        {currentUserEvent && metadata?.name ? (
                          <EmojifiedText tags={currentUserEvent.tags}>{metadata.name}</EmojifiedText>
                        ) : (metadata?.name || genUserName(user?.pubkey))}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {metadata?.nip05 ? `@${formatNip05Display(metadata.nip05)}` : ''}
                      </span>
                    </>
                  )}
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
              <Link
                to={getProfileUrl(currentUser.pubkey, currentUser.metadata)}
                onClick={() => setAccountPopoverOpen(false)}
                className="block p-4 border-b border-border hover:bg-secondary/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="size-11 shrink-0">
                    <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">
                      {getDisplayName(currentUser).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm truncate">
                      {currentUser.event ? (
                        <EmojifiedText tags={currentUser.event.tags}>{getDisplayName(currentUser)}</EmojifiedText>
                      ) : getDisplayName(currentUser)}
                    </span>
                    {currentUser.metadata.nip05 && (
                      <span className="text-xs text-muted-foreground truncate">
                        @{formatNip05Display(currentUser.metadata.nip05)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>

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
                        <span className="text-sm font-medium truncate">
                          {account.event ? (
                            <EmojifiedText tags={account.event.tags}>{getDisplayName(account)}</EmojifiedText>
                          ) : getDisplayName(account)}
                        </span>
                        {account.metadata.nip05 && (
                          <span className="text-xs text-muted-foreground truncate">
                            @{formatNip05Display(account.metadata.nip05)}
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
        onSignupClick={startSignup}
      />
    </aside>
  );
}
