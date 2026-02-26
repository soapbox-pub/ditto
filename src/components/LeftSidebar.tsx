import { useState, useCallback, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Home, Search, TrendingUp, Clapperboard, BarChart3, Palette, PartyPopper, Radio, FileText,
  User, Settings, Bookmark, UserPlus, LogOut, Check, Moon, Sun, Monitor,
  ChevronDown, Plus, Pencil, X, GripVertical,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Skeleton } from '@/components/ui/skeleton';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { DittoLogo } from '@/components/DittoLogo';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/components/InitialSyncGate';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoggedInAccounts, type Account } from '@/hooks/useLoggedInAccounts';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useTheme } from '@/hooks/useTheme';
import { useFeedSettings, getBuiltinItem } from '@/hooks/useFeedSettings';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { useUserThemes } from '@/hooks/useUserThemes';
import { getExtraKindDef } from '@/lib/extraKinds';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { cn } from '@/lib/utils';
import type { Theme } from '@/contexts/AppContext';
import { themePresets } from '@/themes';

// ── Icon map ──────────────────────────────────────────────────────────────────

/** Map item ID to lucide icon (size-6 for sidebar). Covers both built-ins and extra-kinds. */
const ITEM_ICONS: Record<string, React.ReactElement> = {
  // Built-ins
  feed: <Home className="size-6" />,
  notifications: <Bell className="size-6" />,
  search: <Search className="size-6" />,
  trends: <TrendingUp className="size-6" />,
  bookmarks: <Bookmark className="size-6" />,
  profile: <User className="size-6" />,
  settings: <Settings className="size-6" />,
  // Extra-kinds
  vines: <Clapperboard className="size-6" />,
  polls: <BarChart3 className="size-6" />,
  treasures: <ChestIcon className="size-6" />,
  colors: <Palette className="size-6" />,
  packs: <PartyPopper className="size-6" />,
  streams: <Radio className="size-6" />,
  articles: <FileText className="size-6" />,
  decks: <CardsIcon className="size-6" />,
};

/** Lookup label for an item ID (built-in or extra-kind). */
function itemLabel(id: string): string {
  const builtin = getBuiltinItem(id);
  if (builtin) return builtin.label;
  return getExtraKindDef(id)?.label ?? id;
}

/** Lookup navigation path for an item ID. profilePath overrides the profile item's static path. */
function itemPath(id: string, profilePath?: string): string {
  if (id === 'profile' && profilePath) return profilePath;
  const builtin = getBuiltinItem(id);
  if (builtin) return builtin.path;
  const def = getExtraKindDef(id);
  return def?.route ? `/${def.route}` : `/${id}`;
}

/** Check if a location pathname matches an item. profilePath is the dynamic user profile URL. */
function isItemActive(id: string, pathname: string, search: string, profilePath?: string): boolean {
  if (id === 'feed') return pathname === '/';
  if (id === 'notifications') return pathname === '/notifications';
  if (id === 'search') return pathname === '/search' && !search.includes('tab=trends');
  if (id === 'trends') return pathname === '/search' && search.includes('tab=trends');
  if (id === 'bookmarks') return pathname === '/bookmarks';
  if (id === 'profile') return !!profilePath && pathname === profilePath;
  if (id === 'settings') return pathname.startsWith('/settings');
  const def = getExtraKindDef(id);
  return def?.route ? pathname === `/${def.route}` : pathname === `/${id}`;
}

// ── Sortable explore item ─────────────────────────────────────────────────────

interface ExploreItemProps {
  id: string;
  active: boolean;
  editing: boolean;
  onRemove: (id: string) => void;
  onClick?: (e: React.MouseEvent) => void;
  /** Dynamic profile URL for profile items. */
  profilePath?: string;
  /** Whether to show the unread indicator (for notifications). */
  showIndicator?: boolean;
}

function SortableExploreItem({ id, active, editing, onRemove, onClick, profilePath, showIndicator }: ExploreItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const icon = ITEM_ICONS[id] ?? <Palette className="size-6" />;
  const label = itemLabel(id);
  const path = itemPath(id, profilePath);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center rounded-full transition-colors relative',
        isDragging && 'z-10 opacity-80 shadow-lg bg-background',
      )}
    >
      {/* Drag handle — only in edit mode */}
      {editing && (
        <button
          className="flex items-center justify-center w-8 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <Link
        to={path}
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 py-3 rounded-full transition-colors text-lg hover:bg-secondary/60 flex-1 min-w-0',
          editing ? 'px-2' : 'px-4',
          active ? 'font-bold text-foreground' : 'font-normal text-muted-foreground',
        )}
      >
        <span className="shrink-0 relative">
          {icon}
          {showIndicator && (
            <span className="absolute top-0 right-0 size-2.5 bg-primary rounded-full" />
          )}
        </span>
        <span className="truncate">{label}</span>
      </Link>

      {/* Remove button — only visible in edit mode */}
      {editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(id); }}
          className="flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title={`Remove ${label} from sidebar`}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────



// ── Main sidebar ──────────────────────────────────────────────────────────────

export function LeftSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent, isLoading: isProfileLoading } = useCurrentUser();
  const { currentUser, otherUsers, setLogin } = useLoggedInAccounts();
  const { logout } = useLoginActions();
  const { theme, setTheme, applyCustomTheme, customTheme } = useTheme();
  const {
    orderedItems, hiddenItems, updateSidebarOrder, addToSidebar, removeFromSidebar,
  } = useFeedSettings();

  // Filter out auth-required items when not logged in
  const visibleItems = useMemo(() => {
    if (user) return orderedItems;
    return orderedItems.filter((id) => {
      const builtin = getBuiltinItem(id);
      return !builtin?.requiresAuth;
    });
  }, [orderedItems, user]);

  // Also filter hidden items for auth
  const visibleHiddenItems = useMemo(() => {
    if (user) return hiddenItems;
    return hiddenItems.filter((item) => {
      const builtin = getBuiltinItem(item.id);
      return !builtin?.requiresAuth;
    });
  }, [hiddenItems, user]);
  const hasUnread = useHasUnreadNotifications();
  const userProfileUrl = useProfileUrl(user?.pubkey ?? '', metadata);
  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();
  const [accountPopoverOpen, setAccountPopoverOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  /** When already on the target route, scroll to top instead of navigating. */
  const scrollToTopIfCurrent = useCallback((to: string) => (e: React.MouseEvent) => {
    if (location.pathname === to) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [location.pathname]);

  /** Handle drag-and-drop reorder. */
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedItems.indexOf(active.id as string);
    const newIndex = orderedItems.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedItems, oldIndex, newIndex);
    updateSidebarOrder(newOrder);
  }, [orderedItems, updateSidebarOrder]);

  const getDisplayName = (account: Account): string => {
    return account.metadata.name ?? genUserName(account.pubkey);
  };

  const handleLogin = () => {
    setLoginDialogOpen(false);
  };

  const handleLogout = async () => {
    setAccountPopoverOpen(false);
    await logout();
    navigate('/');
  };

  // ── Theme options ──────────────────────────────────────────────────────────

  const builtinThemeOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'system', label: 'System', icon: <Monitor className="size-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
  ];

  const presetOptions = Object.entries(themePresets)
    .filter(([, preset]) => preset.featured)
    .map(([id, preset]) => ({
      id,
      label: preset.label,
      emoji: preset.emoji,
    }));

  const activePreset = theme === 'custom' && customTheme
    ? Object.entries(themePresets).find(([, p]) => JSON.stringify(p.colors) === JSON.stringify(customTheme))
    : undefined;

  // User's published themes for the dropdown
  const sidebarUserThemes = useUserThemes(user?.pubkey);

  // Check if current custom theme matches a user-published theme
  const activeUserTheme = theme === 'custom' && customTheme && !activePreset
    ? sidebarUserThemes.data?.find(t => JSON.stringify(t.colors) === JSON.stringify(customTheme))
    : undefined;

  const currentThemeLabel = (() => {
    if (theme !== 'custom') {
      return builtinThemeOptions.find(t => t.value === theme)?.label ?? theme;
    }
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
      {/* Logo row */}
      <div className="flex items-center px-3 mb-1">
        <Link to="/" onClick={scrollToTopIfCurrent('/')}>
          <DittoLogo size={48} />
        </Link>
      </div>

      {/* Search bar */}
      <div className="px-2 py-4">
        <ProfileSearchDropdown
          placeholder="Search..."
          inputClassName="py-3.5"
          enableTextSearch
        />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col gap-0.5 flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={visibleItems}
            strategy={verticalListSortingStrategy}
          >
            {visibleItems.map((id) => (
              <SortableExploreItem
                key={id}
                id={id}
                active={isItemActive(id, location.pathname, location.search, userProfileUrl)}
                editing={editing}
                onRemove={removeFromSidebar}
                onClick={id === 'feed' ? scrollToTopIfCurrent('/') : undefined}
                profilePath={id === 'profile' ? userProfileUrl : undefined}
                showIndicator={id === 'notifications' ? hasUnread : undefined}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* Sidebar actions: Done editing / Edit sidebar / More... dropdown */}
        {editing ? (
          <button
            onClick={() => setEditing(false)}
            className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-primary font-medium hover:bg-primary/10"
          >
            <Check className="size-4" />
            <span>Done editing</span>
          </button>
        ) : visibleHiddenItems.length === 0 ? (
          <button
            onClick={() => setEditing(true)}
            className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40"
          >
            <Pencil className="size-4" />
            <span>Edit sidebar</span>
          </button>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40"
              >
                <Plus className="size-4" />
                <span>More...</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[240px]">
              {/* Edit sidebar */}
              <DropdownMenuItem
                onClick={() => setEditing(true)}
                className="flex items-center gap-3 py-2.5 cursor-pointer"
              >
                <Pencil className="size-5" />
                <span className="text-sm">Edit sidebar</span>
              </DropdownMenuItem>

              {/* Hidden items */}
              <DropdownMenuSeparator />
              {visibleHiddenItems.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  asChild
                  className="flex items-center gap-3 py-2.5 cursor-pointer"
                >
                  <Link to={itemPath(item.id)}>
                    {ITEM_ICONS[item.id] ? (
                      <span className="size-5 flex items-center justify-center [&>svg]:size-5">
                        {ITEM_ICONS[item.id]}
                      </span>
                    ) : (
                      <Palette className="size-5" />
                    )}
                    <span className="text-sm flex-1">{item.label}</span>
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); addToSidebar(item.id); }}
                      className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                      title={`Add ${item.label} to sidebar`}
                    >
                      <Plus className="size-4" />
                    </button>
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}


      </nav>

      {/* User profile at bottom — only when logged in */}
      {user && currentUser && (
        <div className="pt-2">
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
                      {metadata?.nip05 && user && (
                        <VerifiedNip05Text nip05={metadata.nip05} pubkey={user.pubkey} className="text-xs text-muted-foreground truncate" />
                      )}
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
                to={userProfileUrl}
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
                      <VerifiedNip05Text nip05={currentUser.metadata.nip05} pubkey={currentUser.pubkey} className="text-xs text-muted-foreground truncate" />
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
                          <VerifiedNip05Text nip05={account.metadata.nip05} pubkey={account.pubkey} className="text-xs text-muted-foreground truncate" />
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
                        {currentThemeIcon}
                        <span className="text-xs">{currentThemeLabel}</span>
                        <ChevronDown className="size-4" />
                      </div>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="top" className="w-48">
                    {builtinThemeOptions.map((opt) => (
                      <DropdownMenuItem
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          {opt.icon}
                          <span>{opt.label}</span>
                        </div>
                        {theme === opt.value && (
                          <Check className="size-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    ))}
                    {presetOptions.map((preset) => {
                      const isActive = theme === 'custom' && customTheme && JSON.stringify(customTheme) === JSON.stringify(themePresets[preset.id].colors);
                      return (
                        <DropdownMenuItem
                          key={preset.id}
                          onClick={() => applyCustomTheme(themePresets[preset.id].colors)}
                          className="flex items-center justify-between cursor-pointer"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-sm leading-none">{preset.emoji}</span>
                            <span>{preset.label}</span>
                          </div>
                          {isActive && (
                            <Check className="size-4 text-primary" />
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                    {/* User's published themes */}
                    {sidebarUserThemes.data && sidebarUserThemes.data.length > 0 && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">My Themes</DropdownMenuLabel>
                        {sidebarUserThemes.data.map((ut) => {
                          const isActive = theme === 'custom' && customTheme && JSON.stringify(customTheme) === JSON.stringify(ut.colors);
                          return (
                            <DropdownMenuItem
                              key={ut.identifier}
                              onClick={() => applyCustomTheme(ut.colors)}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <Palette className="size-3.5 text-primary shrink-0" />
                                <span className="truncate">{ut.title}</span>
                              </div>
                              {isActive && (
                                <Check className="size-4 text-primary shrink-0" />
                              )}
                            </DropdownMenuItem>
                          );
                        })}
                      </>
                    )}
                    {/* Custom theme item — shown when user has a non-preset, non-published custom theme */}
                    {customTheme && !activePreset && !activeUserTheme && (
                      <DropdownMenuItem
                        onClick={() => {
                          setAccountPopoverOpen(false);
                          navigate('/settings/theme');
                        }}
                        className="flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <Palette className="size-4" />
                          <span>Custom</span>
                        </div>
                        {theme === 'custom' && (
                          <Check className="size-4 text-primary" />
                        )}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        setAccountPopoverOpen(false);
                        navigate('/settings/appearance');
                      }}
                      className="cursor-pointer text-muted-foreground"
                    >
                      More...
                    </DropdownMenuItem>
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
