import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, Settings, LogOut, ChevronDown, ChevronUp, Sun, Moon, Monitor, Clapperboard, BarChart3, Palette, PartyPopper, Radio, FileText } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { DittoLogo } from '@/components/DittoLogo';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { useTheme } from '@/hooks/useTheme';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { LoginArea } from '@/components/auth/LoginArea';
import { genUserName } from '@/lib/genUserName';
import { useMemo, useState } from 'react';
import type { Theme } from '@/contexts/AppContext';
import { themePresets } from '@/themes';

/** Map route name to icon for extra kind drawer items. */
const ROUTE_ICONS: Record<string, React.ReactNode> = {
  vines: <Clapperboard className="size-5" />,
  polls: <BarChart3 className="size-5" />,
  treasures: <ChestIcon className="size-5" />,
  colors: <Palette className="size-5" />,
  packs: <PartyPopper className="size-5" />,
  streams: <Radio className="size-5" />,
  articles: <FileText className="size-5" />,
  decks: <CardsIcon className="size-5" />,
};

function routeLabel(route: string): string {
  return EXTRA_KINDS.find((d) => d.route === route)?.label ?? route;
}

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface DrawerMenuItemProps {
  to: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

function DrawerMenuItem({ to, icon, label, onClick }: DrawerMenuItemProps) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-4 py-3.5 px-2 rounded-lg hover:bg-secondary/60 transition-colors text-[15px]"
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const { user } = useCurrentUser();
  const { logout } = useLoginActions();
  const { otherUsers, setLogin } = useLoggedInAccounts();
  const { theme, setTheme, applyCustomTheme, customTheme } = useTheme();
  const { orderedRoutes } = useFeedSettings();
  const navigate = useNavigate();
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

  /** Build explore items from ordered routes. */
  const exploreItems = useMemo(() => {
    return orderedRoutes.map((route) => ({
      to: `/${route}`,
      icon: ROUTE_ICONS[route] ?? <Palette className="size-5" />,
      label: routeLabel(route),
    }));
  }, [orderedRoutes]);

  // Theme cycling logic
  const builtinCycle: { id: Theme; label: string; icon: React.ReactNode }[] = [
    { id: 'system', label: 'System', icon: <Monitor className="size-5" /> },
    { id: 'light', label: 'Light', icon: <Sun className="size-5" /> },
    { id: 'dark', label: 'Dark', icon: <Moon className="size-5" /> },
  ];

  const presetCycle = Object.entries(themePresets)
    .filter(([, preset]) => preset.featured)
    .map(([id, preset]) => ({
      id,
      label: preset.label,
      icon: <span className="text-base leading-none">{preset.emoji}</span>,
    }));

  const allThemeCycle = [...builtinCycle, ...presetCycle];

  const currentThemeInfo = (() => {
    if (theme !== 'custom') {
      return builtinCycle.find(t => t.id === theme) ?? builtinCycle[0];
    }
    if (customTheme) {
      const allMatch = Object.entries(themePresets).find(([, p]) => JSON.stringify(p.tokens) === JSON.stringify(customTheme));
      if (allMatch) {
        const [id, preset] = allMatch;
        const cycleEntry = presetCycle.find(p => p.id === id);
        if (cycleEntry) return cycleEntry;
        return { id, label: preset.label, icon: <span className="text-base leading-none">{preset.emoji}</span> };
      }
    }
    return { id: 'custom', label: 'Custom', icon: <Palette className="size-5" /> };
  })();

  const cycleTheme = () => {
    const currentId = currentThemeInfo.id;
    const idx = allThemeCycle.findIndex(t => t.id === currentId);
    const nextIdx = (idx + 1) % allThemeCycle.length;
    const next = allThemeCycle[nextIdx];

    const builtin = builtinCycle.find(b => b.id === next.id);
    if (builtin) {
      setTheme(builtin.id);
    } else {
      applyCustomTheme(themePresets[next.id].tokens);
    }
  };

  const handleClose = () => onOpenChange(false);

  const handleLogout = async () => {
    await logout();
    handleClose();
    navigate('/');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[300px] p-0 border-r-border">
        <SheetTitle className="sr-only">Navigation menu</SheetTitle>

        {user ? (
          <div className="flex flex-col h-full">
            {/* Logo header */}
            <div className="px-5 flex items-center" style={{ paddingTop: `calc(1.25rem + env(safe-area-inset-top, 0px))`, paddingBottom: '1rem' }}>
              <Link to="/" onClick={handleClose}>
                <DittoLogo size={36} />
              </Link>
            </div>

            <Separator />

            {/* Menu items */}
            <nav className="flex-1 overflow-y-auto px-3 py-2">
              {/* Explore section */}
              {exploreItems.length > 0 && (
                <>
                  <div className="flex items-center gap-2 px-2 pt-3 pb-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Explore
                    </span>
                    <div className="flex-1 h-px bg-border/50" />
                  </div>

                  {exploreItems.map((item) => (
                    <DrawerMenuItem
                      key={item.to}
                      to={item.to}
                      icon={item.icon}
                      label={item.label}
                      onClick={handleClose}
                    />
                  ))}

                  {/* Manage link */}
                  <button
                    onClick={() => {
                      handleClose();
                      navigate('/settings');
                    }}
                    className="flex items-center gap-4 py-2 px-2 rounded-lg text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                  >
                    <span className="ml-9">Manage...</span>
                  </button>

                  <div className="my-2 mx-2">
                    <Separator />
                  </div>
                </>
              )}

              <DrawerMenuItem
                to="/bookmarks"
                icon={<Bookmark className="size-5" />}
                label="Bookmarks"
                onClick={handleClose}
              />
              <DrawerMenuItem
                to="/settings"
                icon={<Settings className="size-5" />}
                label="Settings"
                onClick={handleClose}
              />

              <button
                onClick={handleLogout}
                className="flex items-center gap-4 py-3.5 px-2 rounded-lg hover:bg-secondary/60 transition-colors text-[15px] w-full text-left"
              >
                <span className="text-muted-foreground">
                  <LogOut className="size-5" />
                </span>
                <span className="font-medium">Logout</span>
              </button>
            </nav>

            <Separator />

            {/* Theme toggle */}
            <div className="px-3 pt-2" style={{ paddingBottom: otherUsers.length > 0 ? '0.25rem' : `calc(0.5rem + env(safe-area-inset-bottom, 0px))` }}>
              <button
                onClick={cycleTheme}
                className="flex items-center justify-between w-full py-3.5 px-2 rounded-lg hover:bg-secondary/60 transition-colors text-[15px]"
              >
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">{currentThemeInfo.icon}</span>
                  <span className="font-medium">Theme</span>
                </div>
                <span className="text-sm text-muted-foreground">{currentThemeInfo.label}</span>
              </button>
            </div>

            {otherUsers.length > 0 && (
              <>
                <Separator />

                {/* Switch accounts section */}
                <div className="px-3 py-2" style={{ paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px))` }}>
                  <button
                    onClick={() => setShowAccountSwitcher(!showAccountSwitcher)}
                    className="flex items-center justify-between w-full py-3 px-2 text-[15px] font-medium"
                  >
                    <span>Switch accounts</span>
                    {showAccountSwitcher
                      ? <ChevronUp className="size-4 text-muted-foreground" />
                      : <ChevronDown className="size-4 text-muted-foreground" />
                    }
                  </button>

                  {showAccountSwitcher && (
                    <div className="space-y-1 pb-2">
                      {otherUsers.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => {
                            setLogin(account.id);
                            handleClose();
                          }}
                          className="flex items-center gap-3 w-full py-2 px-2 rounded-lg hover:bg-secondary/60 transition-colors"
                        >
                          <Avatar className="size-8">
                            <AvatarImage src={account.metadata.picture} alt={account.metadata.name} />
                            <AvatarFallback className="bg-primary/20 text-primary text-xs">
                              {(account.metadata.name?.[0] || genUserName(account.pubkey)[0]).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm truncate">
                            {account.metadata.name || genUserName(account.pubkey)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
            <DittoLogo size={48} />
            <p className="text-muted-foreground text-center text-sm">Log in to access all features</p>
            <LoginArea className="w-full flex flex-col" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
