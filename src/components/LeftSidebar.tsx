import { useState, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  UserPlus, LogOut, Check, Moon, Sun, Monitor, Palette, ChevronDown,
  Loader2,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DittoLogo } from '@/components/DittoLogo';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import { SidebarNavList } from '@/components/SidebarNavItem';
import { SidebarMoreMenu } from '@/components/SidebarMoreMenu';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useTheme } from '@/hooks/useTheme';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useAppContext } from '@/hooks/useAppContext';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getSidebarItem, isItemActive } from '@/lib/sidebarItems';
import { themePresets } from '@/themes';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useUserThemes } from '@/hooks/useUserThemes';
import { useUserStatus } from '@/hooks/useUserStatus';
import { usePublishStatus } from '@/hooks/usePublishStatus';
import { useToast } from '@/hooks/useToast';
import { Input } from '@/components/ui/input';
import type { Theme } from '@/contexts/AppContext';

export function LeftSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent, isLoading: isProfileLoading } = useCurrentUser();
  const { currentUser, otherUsers, setLogin } = useLoggedInAccounts();
  const { logout } = useLoginActions();
  const { theme, setTheme, applyCustomTheme, customTheme } = useTheme();
  const {
    orderedItems, hiddenItems, updateSidebarOrder, addToSidebar, addDividerToSidebar, removeFromSidebar,
  } = useFeedSettings();
  const { config } = useAppContext();

  const visibleItems = useMemo(() => {
    if (user) return orderedItems;
    return orderedItems.filter((id) => !getSidebarItem(id)?.requiresAuth);
  }, [orderedItems, user]);

  const visibleHiddenItems = useMemo(() => {
    if (user) return hiddenItems;
    return hiddenItems.filter((item) => !getSidebarItem(item.id)?.requiresAuth);
  }, [hiddenItems, user]);

  const hasUnread = useHasUnreadNotifications();
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // NIP-38 status
  const userStatus = useUserStatus(user?.pubkey);
  const publishStatus = usePublishStatus();
  const { toast } = useToast();
  const [statusEditing, setStatusEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState('');

  const homePage = config.homePage;

  const scrollToTopIfCurrent = useCallback((to: string) => (e: React.MouseEvent) => {
    if (location.pathname === to) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  const getDisplayName = (account: Account) => account.metadata.name ?? genUserName(account.pubkey);

  const handleLogout = async () => {
    setAccountPopoverOpen(false);
    await logout();
    navigate('/');
  };

  // ── Theme (for the popover inline display) ────────────────────────────────

  const builtinThemeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'system', label: 'System', icon: <Monitor className="size-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
  ];
  const presetOptions = Object.entries(themePresets).filter(([, p]) => p.featured).slice(0, 5).map(([id, p]) => ({ id, label: p.label, emoji: p.emoji }));
  const activePreset = theme === 'custom' && customTheme ? Object.entries(themePresets).find(([, p]) => JSON.stringify(p.colors) === JSON.stringify(customTheme)) : undefined;
  const sidebarUserThemes = useUserThemes(user?.pubkey);
  const activeUserTheme = theme === 'custom' && customTheme && !activePreset ? sidebarUserThemes.data?.find(t => JSON.stringify(t.colors) === JSON.stringify(customTheme)) : undefined;
  const currentThemeLabel = (() => {
    if (theme !== 'custom') return builtinThemeOptions.find(t => t.value === theme)?.label ?? theme;
    if (activePreset) return activePreset[1].label;
    if (activeUserTheme) return activeUserTheme.title;
    return 'Custom';
  })();
  const currentThemeIcon = (() => {
    const builtin = builtinThemeOptions.find(t => t.value === theme);
    if (builtin) return builtin.icon;
    if (activePreset) return <span className="text-sm leading-none">{activePreset[1].emoji}</span>;
    return <Palette className="size-4" />;
  })();

  return (
    <aside className="flex flex-col h-screen sticky top-0 py-3 px-4 w-[300px] shrink-0">
      {/* Logo */}
      <div className="flex items-center px-3 mb-1">
        <Link to="/" onClick={scrollToTopIfCurrent('/')}>
          <div className="bg-background/85 rounded-full">
            <DittoLogo size={48} />
          </div>
        </Link>
      </div>

      {/* Search */}
      <div className="px-2 py-4">
        <ProfileSearchDropdown placeholder="Search..." inputClassName="py-3.5" enableTextSearch />
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <SidebarNavList
          items={visibleItems}
          editing={editing}
          onRemove={removeFromSidebar}
          onReorder={updateSidebarOrder}
          isActive={(id) => isItemActive(id, location.pathname, location.search, userProfileUrl, homePage)}
          getOnClick={(id) => id === homePage ? scrollToTopIfCurrent('/') : undefined}
          getProfilePath={(id) => id === 'profile' ? userProfileUrl : undefined}
          getShowIndicator={(id) => id === 'notifications' ? hasUnread : undefined}
          homePage={homePage}
        />

        <SidebarMoreMenu
          editing={editing}
          hiddenItems={visibleHiddenItems}
          onDoneEditing={() => setEditing(false)}
          onStartEditing={() => setEditing(true)}
          onAdd={addToSidebar}
          onAddDivider={addDividerToSidebar}
          open={moreMenuOpen}
          onOpenChange={setMoreMenuOpen}
          homePage={homePage}
        />
      </nav>

      {/* Logged-out join pill — same position as account button, pushed up from bottom */}
      {!user && location.pathname !== '/' && (
        <div className="pt-2 pb-1">
          <button
            onClick={() => setLoginDialogOpen(true)}
            className="flex items-center justify-center w-full h-10 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90 transition-colors cursor-pointer"
          >
            Join
          </button>
        </div>
      )}

      {/* User profile at bottom */}
      {user && currentUser && (
        <div className="pt-2">
          <Popover open={accountPopoverOpen} onOpenChange={setAccountPopoverOpen}>
            <PopoverTrigger asChild>
              <button className="flex items-center gap-3 p-3 rounded-full hover:bg-secondary/60 transition-colors cursor-pointer w-full text-left bg-background/85">
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
                    <><Skeleton className="h-3.5 w-24" /><Skeleton className="h-3 w-16" /></>
                  ) : (
                    <>
                      <span className="font-semibold text-sm truncate">
                        {currentUserEvent && metadata?.name
                          ? <EmojifiedText tags={currentUserEvent.tags}>{metadata.name}</EmojifiedText>
                          : (metadata?.name || genUserName(user.pubkey))}
                      </span>
                      {metadata?.nip05 && (
                        <VerifiedNip05Text nip05={metadata.nip05} pubkey={user.pubkey} className="text-xs text-muted-foreground truncate" />
                      )}
                    </>
                  )}
                </div>
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" sideOffset={8} className="w-[260px] p-0 rounded-2xl shadow-xl border border-border overflow-hidden">
              {/* Current user */}
              <Link to={userProfileUrl} onClick={() => setAccountPopoverOpen(false)} className="block p-4 border-b border-border hover:bg-secondary/60 transition-colors">
                <div className="flex items-center gap-3">
                  <Avatar className="size-11 shrink-0">
                    <AvatarImage src={currentUser.metadata.picture} alt={getDisplayName(currentUser)} />
                    <AvatarFallback className="bg-primary/20 text-primary text-sm">{getDisplayName(currentUser).charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="font-bold text-sm truncate">
                      {currentUser.event ? <EmojifiedText tags={currentUser.event.tags}>{getDisplayName(currentUser)}</EmojifiedText> : getDisplayName(currentUser)}
                    </span>
                    {currentUser.metadata.nip05 && (
                      <VerifiedNip05Text nip05={currentUser.metadata.nip05} pubkey={currentUser.pubkey} className="text-xs text-muted-foreground truncate" />
                    )}
                  </div>
                </div>
              </Link>

              {/* Status editor */}
              <div className="border-b border-border">
                {statusEditing ? (
                  <div className="p-3 space-y-2">
                    <Input
                      value={statusDraft}
                      onChange={(e) => setStatusDraft(e.target.value.slice(0, 80))}
                      placeholder="What are you up to?"
                      className="h-8 text-sm"
                      maxLength={80}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const text = statusDraft.trim();
                          publishStatus.mutateAsync({ status: text }).then(() => {
                            setStatusEditing(false);
                            setStatusDraft('');
                            toast({ title: text ? 'Status updated' : 'Status cleared' });
                          });
                        } else if (e.key === 'Escape') {
                          setStatusEditing(false);
                          setStatusDraft('');
                        }
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          const text = statusDraft.trim();
                          publishStatus.mutateAsync({ status: text }).then(() => {
                            setStatusEditing(false);
                            setStatusDraft('');
                            toast({ title: text ? 'Status updated' : 'Status cleared' });
                          });
                        }}
                        disabled={publishStatus.isPending}
                        className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                      >
                        {publishStatus.isPending ? <Loader2 className="size-3 animate-spin" /> : 'Save'}
                      </button>
                      {userStatus.status && (
                        <button
                          onClick={() => {
                            publishStatus.mutateAsync({ status: '' }).then(() => {
                              setStatusEditing(false);
                              setStatusDraft('');
                              toast({ title: 'Status cleared' });
                            });
                          }}
                          disabled={publishStatus.isPending}
                          className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                        >
                          Clear
                        </button>
                      )}
                      <button
                        onClick={() => { setStatusEditing(false); setStatusDraft(''); }}
                        className="text-xs text-muted-foreground hover:underline ml-auto"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setStatusEditing(true);
                      setStatusDraft(userStatus.status ?? '');
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2.5 text-sm hover:bg-secondary/60 transition-colors"
                  >
                    {userStatus.status ? (
                      <span className="truncate text-muted-foreground italic text-xs">{userStatus.status}</span>
                    ) : (
                      <span className="text-muted-foreground">Set a status</span>
                    )}
                  </button>
                )}
              </div>

              {/* Other accounts */}
              {otherUsers.length > 0 && (
                <div className="border-b border-border">
                  {otherUsers.map((account) => (
                    <button key={account.id} onClick={() => { setLogin(account.id); setAccountPopoverOpen(false); }} className="flex items-center gap-3 w-full px-4 py-3 hover:bg-secondary/60 transition-colors">
                      <Avatar className="size-9 shrink-0">
                        <AvatarImage src={account.metadata.picture} alt={getDisplayName(account)} />
                        <AvatarFallback className="bg-primary/20 text-primary text-xs">{getDisplayName(account).charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-medium truncate">
                          {account.event ? <EmojifiedText tags={account.event.tags}>{getDisplayName(account)}</EmojifiedText> : getDisplayName(account)}
                        </span>
                        {account.metadata.nip05 && <VerifiedNip05Text nip05={account.metadata.nip05} pubkey={account.pubkey} className="text-xs text-muted-foreground truncate" />}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Theme */}
              <div className="border-b border-border py-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 transition-colors">
                      <div className="flex items-center gap-3"><Palette className="size-4 text-muted-foreground" /><span>Theme</span></div>
                      <div className="flex items-center gap-2 text-muted-foreground">{currentThemeIcon}<span className="text-xs">{currentThemeLabel}</span><ChevronDown className="size-4" /></div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-48 z-[270]">
                    {builtinThemeOptions.map((opt) => (
                      <DropdownMenuItem key={opt.value} onClick={() => setTheme(opt.value)} className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2">{opt.icon}<span>{opt.label}</span></div>
                        {theme === opt.value && <Check className="size-4 text-primary" />}
                      </DropdownMenuItem>
                    ))}
                    {presetOptions.map((preset) => {
                      const p = themePresets[preset.id];
                      const isActive = theme === 'custom' && customTheme && JSON.stringify(customTheme.colors) === JSON.stringify(p.colors);
                      return (
                        <DropdownMenuItem key={preset.id} onClick={() => applyCustomTheme({ colors: p.colors, font: p.font, background: p.background })} className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-2"><span className="text-sm leading-none">{preset.emoji}</span><span>{preset.label}</span></div>
                          {isActive && <Check className="size-4 text-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                    {sidebarUserThemes.data && sidebarUserThemes.data.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">My Themes</DropdownMenuLabel>
                        {sidebarUserThemes.data.map((ut) => {
                          const isActive = theme === 'custom' && customTheme && JSON.stringify(customTheme.colors) === JSON.stringify(ut.colors);
                          return (
                            <DropdownMenuItem key={ut.identifier} onClick={() => applyCustomTheme({ colors: ut.colors, font: ut.font, background: ut.background ?? customTheme?.background })} className="flex items-center justify-between cursor-pointer">
                              <div className="flex items-center gap-2 min-w-0"><Palette className="size-3.5 text-primary shrink-0" /><span className="truncate">{ut.title}</span></div>
                              {isActive && <Check className="size-4 text-primary shrink-0" />}
                            </DropdownMenuItem>
                          );
                        })}
                      </>
                    )}
                    {customTheme && !activePreset && !activeUserTheme && (
                      <DropdownMenuItem onClick={() => { setTheme('custom'); }} className="flex items-center justify-between cursor-pointer">
                        <div className="flex items-center gap-2"><Palette className="size-4" /><span>Custom</span></div>
                        {theme === 'custom' && <Check className="size-4 text-primary" />}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setAccountPopoverOpen(false); navigate('/themes'); }} className="cursor-pointer text-muted-foreground">More...</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Actions */}
              <div className="py-1">
                <button onClick={() => { setAccountPopoverOpen(false); setLoginDialogOpen(true); }} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 transition-colors">
                  <UserPlus className="size-4 text-muted-foreground" />
                  <span>Add another account</span>
                </button>
                <button onClick={handleLogout} className="flex items-center gap-3 w-full px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors">
                  <LogOut className="size-4" />
                  <span>Log out @{metadata?.name || genUserName(user.pubkey)}</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      <LoginDialog isOpen={loginDialogOpen} onClose={() => setLoginDialogOpen(false)} onLogin={() => setLoginDialogOpen(false)} onSignupClick={startSignup} />
    </aside>
  );
}
