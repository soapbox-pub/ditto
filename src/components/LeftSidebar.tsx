import { useState, useMemo, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Clapperboard, BarChart3, Palette, PartyPopper, Radio, FileText,
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
import { Button } from '@/components/ui/button';
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
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useHasUnreadNotifications } from '@/hooks/useHasUnreadNotifications';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { genUserName } from '@/lib/genUserName';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { cn } from '@/lib/utils';
import type { Theme } from '@/contexts/AppContext';
import { themePresets } from '@/themes';

// ── Icon map ──────────────────────────────────────────────────────────────────

/** Map route name to lucide icon (size-6 for sidebar). */
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

/** Lookup label for a route. */
function routeLabel(route: string): string {
  return EXTRA_KINDS.find((d) => d.route === route)?.label ?? route;
}

// ── Nav item components ───────────────────────────────────────────────────────

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

// ── Sortable explore item ─────────────────────────────────────────────────────

interface ExploreItemProps {
  route: string;
  active: boolean;
  editing: boolean;
  onRemove: (route: string) => void;
  onClick?: (e: React.MouseEvent) => void;
}

function SortableExploreItem({ route, active, editing, onRemove, onClick }: ExploreItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: route, disabled: !editing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const icon = ROUTE_ICONS[route] ?? <Palette className="size-6" />;
  const label = routeLabel(route);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group flex items-center rounded-full transition-colors relative',
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
        to={`/${route}`}
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 py-3 rounded-full transition-colors text-lg hover:bg-secondary/60 flex-1 min-w-0',
          editing ? 'px-2' : 'px-4',
          active ? 'font-bold' : 'font-normal text-muted-foreground',
        )}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </Link>

      {/* Remove button — always visible in edit mode, visible on hover otherwise */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(route); }}
        className={cn(
          'flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10',
          editing
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100',
        )}
        title={`Remove ${label} from sidebar`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  label: string;
  editing?: boolean;
  onToggleEdit?: () => void;
}

function SectionHeader({ label, editing, onToggleEdit }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-1">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/50" />
      {onToggleEdit && (
        <button
          onClick={onToggleEdit}
          className={cn(
            'text-xs font-medium transition-colors px-2 py-0.5 rounded-full',
            editing
              ? 'text-primary hover:bg-primary/10'
              : 'text-muted-foreground/70 hover:text-muted-foreground hover:bg-secondary/60',
          )}
        >
          {editing ? (
            'Done'
          ) : (
            <Pencil className="size-3.5" />
          )}
        </button>
      )}
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────

export function LeftSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, metadata, event: currentUserEvent, isLoading: isProfileLoading } = useCurrentUser();
  const { currentUser, otherUsers, setLogin } = useLoggedInAccounts();
  const { logout } = useLoginActions();
  const { theme, setTheme, applyCustomTheme, customTheme } = useTheme();
  const {
    feedSettings, orderedRoutes, updateSidebarOrder, addToSidebar, removeFromSidebar,
  } = useFeedSettings();
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

  /** Extra kinds that have a sidebar toggle but are currently hidden. */
  const hiddenKinds = useMemo(() => {
    return EXTRA_KINDS.filter(
      (def) => def.showKey && def.route && !feedSettings[def.showKey],
    );
  }, [feedSettings]);

  /** Handle drag-and-drop reorder. */
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedRoutes.indexOf(active.id as string);
    const newIndex = orderedRoutes.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = arrayMove(orderedRoutes, oldIndex, newIndex);
    updateSidebarOrder(newOrder);
  }, [orderedRoutes, updateSidebarOrder]);

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
    ? Object.entries(themePresets).find(([, p]) => JSON.stringify(p.tokens) === JSON.stringify(customTheme))
    : undefined;

  const currentThemeLabel = (() => {
    if (theme !== 'custom') {
      return builtinThemeOptions.find(t => t.value === theme)?.label ?? theme;
    }
    return activePreset ? activePreset[1].label : 'Custom';
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
      <Link to="/" className="px-3 mb-1" onClick={scrollToTopIfCurrent('/')}>
        <DittoLogo size={48} />
      </Link>

      {/* Search bar */}
      <div className="px-2 py-4">
        <ProfileSearchDropdown
          placeholder="Search..."
          inputClassName="py-3.5"
          enableTextSearch
        />
      </div>

      {/* Navigation */}
      <nav className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {/* Core navigation — only notifications (Home removed, Search removed) */}
        {user && (
          <NavItem
            to="/notifications"
            icon={<Bell className="size-6" />}
            label="Notifications"
            active={location.pathname === '/notifications'}
            showIndicator={hasUnread}
          />
        )}

        {/* ── Explore section ── */}
        <SectionHeader
          label="Explore"
          editing={editing}
          onToggleEdit={() => setEditing(!editing)}
        />

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedRoutes}
            strategy={verticalListSortingStrategy}
          >
            {orderedRoutes.map((route) => (
              <SortableExploreItem
                key={route}
                route={route}
                active={location.pathname === `/${route}`}
                editing={editing}
                onRemove={removeFromSidebar}
              />
            ))}
          </SortableContext>
        </DndContext>

        {/* "More..." add trigger — subtle inline link */}
        {hiddenKinds.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-4 px-4 py-2.5 rounded-full transition-colors text-sm text-muted-foreground/60 hover:text-muted-foreground hover:bg-secondary/40"
              >
                <Plus className="size-4" />
                <span>More...</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[220px]">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Add to sidebar</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {hiddenKinds.map((def) => (
                <DropdownMenuItem
                  key={def.kind}
                  onClick={() => {
                    if (def.route) {
                      addToSidebar(def.route);
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  {def.route && ROUTE_ICONS[def.route] ? (
                    <span className="size-5 flex items-center justify-center [&>svg]:size-5">
                      {ROUTE_ICONS[def.route]}
                    </span>
                  ) : (
                    <Plus className="size-5 text-muted-foreground" />
                  )}
                  <span className="text-sm">{def.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* ── You section ── (logged-in only) */}
        {user && (
          <>
            <SectionHeader label="You" />

            <NavItem
              to={userProfileUrl}
              icon={<User className="size-6" />}
              label="Profile"
              active={location.pathname === userProfileUrl}
            />
            <NavItem
              to="/bookmarks"
              icon={<Bookmark className="size-6" />}
              label="Bookmarks"
              active={location.pathname === '/bookmarks'}
            />
          </>
        )}

        {/* ── Settings ── */}
        <div className="mt-auto pt-2">
          <div className="h-px bg-border/50 mx-4 mb-1" />
          <NavItem
            to="/settings"
            icon={<Settings className="size-6" />}
            label="Settings"
            active={location.pathname.startsWith('/settings')}
          />
        </div>
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
                      const isActive = theme === 'custom' && customTheme && JSON.stringify(customTheme) === JSON.stringify(themePresets[preset.id].tokens);
                      return (
                        <DropdownMenuItem
                          key={preset.id}
                          onClick={() => applyCustomTheme(themePresets[preset.id].tokens)}
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
