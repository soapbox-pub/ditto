import { Link, useNavigate } from 'react-router-dom';
import { User, Bookmark, Settings, LogOut, ChevronDown, ChevronUp, Cat, Sun, Moon, Heart, Clapperboard, BarChart3, Palette, PartyPopper, Radio, FileText } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { CardsIcon } from '@/components/icons/CardsIcon';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { useTheme } from '@/hooks/useTheme';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import { LoginArea } from '@/components/auth/LoginArea';
import { genUserName } from '@/lib/genUserName';
import { getProfileUrl } from '@/lib/profileUrl';
import { useMemo, useState } from 'react';
import type { Theme } from '@/contexts/AppContext';

/** Map route name → icon for extra kind drawer items. */
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
  const { user, metadata } = useCurrentUser();
  const { logout } = useLoginActions();
  const { otherUsers, setLogin } = useLoggedInAccounts();
  const { theme, setTheme } = useTheme();
  const { feedSettings } = useFeedSettings();
  const navigate = useNavigate();
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

  /** Enabled extra-kind nav items, derived from feed settings. */
  const extraKindItems = useMemo(() => {
    return EXTRA_KINDS
      .filter((def) => def.showKey && def.route && feedSettings[def.showKey])
      .map((def) => ({
        to: `/${def.route!}`,
        icon: ROUTE_ICONS[def.route!] ?? <Palette className="size-5" />,
        label: def.label,
      }));
  }, [feedSettings]);

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'dark', label: 'Ditto', icon: <Cat className="size-5" /> },
    { value: 'light', label: 'Light', icon: <Sun className="size-5" /> },
    { value: 'black', label: 'Black', icon: <Moon className="size-5" /> },
    { value: 'pink', label: 'Pink', icon: <Heart className="size-5" /> },
  ];

  const currentTheme = themes.find(t => t.value === theme) || themes[0];
  const cycleTheme = () => {
    const idx = themes.findIndex(t => t.value === theme);
    const next = themes[(idx + 1) % themes.length];
    setTheme(next.value);
  };

  const displayName = metadata?.name || (user ? genUserName(user.pubkey) : 'Anonymous');
  const nip05 = metadata?.nip05;

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
            {/* User profile header */}
            <div className="px-5 pb-4" style={{ paddingTop: `calc(1.5rem + env(safe-area-inset-top, 0px))` }}>
              <Avatar className="size-10 mb-3">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-primary/20 text-primary text-sm">
                  {displayName[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="font-bold text-[15px]">{displayName}</div>
              {nip05 && (
                <div className="text-sm text-muted-foreground">@{nip05}</div>
              )}
            </div>

            <Separator />

            {/* Menu items */}
            <nav className="flex-1 px-3 py-2">
              {/* Extra kind pages (Vines, Polls, Treasures, etc.) */}
              {extraKindItems.length > 0 && (
                <>
                  {extraKindItems.map((item) => (
                    <DrawerMenuItem
                      key={item.to}
                      to={item.to}
                      icon={item.icon}
                      label={item.label}
                      onClick={handleClose}
                    />
                  ))}
                  <div className="my-2 mx-2">
                    <Separator />
                  </div>
                </>
              )}

              <DrawerMenuItem
                to={user ? getProfileUrl(user.pubkey, metadata) : '/profile'}
                icon={<User className="size-5" />}
                label="Profile"
                onClick={handleClose}
              />
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
                onClick={() => {
                  handleLogout();
                }}
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
            <div className="px-3 pt-2" style={{ paddingBottom: `calc(0.5rem + env(safe-area-inset-bottom, 0px))` }}>
              <button
                onClick={cycleTheme}
                className="flex items-center justify-between w-full py-3.5 px-2 rounded-lg hover:bg-secondary/60 transition-colors text-[15px]"
              >
                <div className="flex items-center gap-4">
                  <span className="text-muted-foreground">{currentTheme.icon}</span>
                  <span className="font-medium">Theme</span>
                </div>
                <span className="text-sm text-muted-foreground">{currentTheme.label}</span>
              </button>
            </div>

            {otherUsers.length > 0 && (
              <>
                <Separator />

                {/* Switch accounts section */}
                <div className="px-3 py-2">
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
            <p className="text-muted-foreground text-center text-sm">Log in to access all features</p>
            <LoginArea className="w-full flex flex-col" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
