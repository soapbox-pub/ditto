import { Link, useNavigate } from 'react-router-dom';
import { LogOut, ChevronDown, ChevronUp, Sun, Moon, Monitor, Palette } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { DittoLogo } from '@/components/DittoLogo';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useLoggedInAccounts } from '@/hooks/useLoggedInAccounts';
import { useTheme } from '@/hooks/useTheme';
import { useUserThemes } from '@/hooks/useUserThemes';
import { LoginArea } from '@/components/auth/LoginArea';
import { genUserName } from '@/lib/genUserName';
import { useMemo, useState } from 'react';
import type { Theme } from '@/contexts/AppContext';
import { themePresets, type CoreThemeColors } from '@/themes';
import { settingsSections, type SettingsSection } from '@/pages/SettingsPage';

// ── Mobile drawer ────────────────────────────────────────────────────────────

interface MobileDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MobileDrawer({ open, onOpenChange }: MobileDrawerProps) {
  const { user } = useCurrentUser();
  const { logout } = useLoginActions();
  const { otherUsers, setLogin } = useLoggedInAccounts();
  const { theme, setTheme, applyCustomTheme, customTheme } = useTheme();
  const navigate = useNavigate();
  const [showAccountSwitcher, setShowAccountSwitcher] = useState(false);

  /** Settings sections filtered by auth state. */
  const visibleSettings = useMemo<SettingsSection[]>(() => {
    return settingsSections.filter((s) => !s.requiresAuth || user);
  }, [user]);

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

  // User's published themes for cycling
  const drawerUserThemes = useUserThemes(user?.pubkey);
  const userThemeCycle = (drawerUserThemes.data ?? []).map((t) => ({
    id: `user:${t.identifier}`,
    label: t.title,
    icon: <Palette className="size-5" />,
    colors: t.colors,
  }));

  // Include "Custom" in the cycle if user has a non-preset, non-published custom theme
  const isCustomNonPreset = theme === 'custom' && customTheme &&
    !Object.entries(themePresets).some(([, p]) => JSON.stringify(p.colors) === JSON.stringify(customTheme)) &&
    !(drawerUserThemes.data ?? []).some(t => JSON.stringify(t.colors) === JSON.stringify(customTheme));
  const customCycleEntry = customTheme && isCustomNonPreset
    ? [{ id: 'custom', label: 'Custom', icon: <Palette className="size-5" />, colors: undefined as CoreThemeColors | undefined }]
    : [];

  const allThemeCycle = [...builtinCycle.map(b => ({ ...b, colors: undefined as CoreThemeColors | undefined })), ...presetCycle.map(p => ({ ...p, colors: undefined as CoreThemeColors | undefined })), ...userThemeCycle, ...customCycleEntry];

  const currentThemeInfo = (() => {
    if (theme !== 'custom') {
      return builtinCycle.find(t => t.id === theme) ?? builtinCycle[0];
    }
    if (customTheme) {
      // Check presets
      const presetMatch = Object.entries(themePresets).find(([, p]) => JSON.stringify(p.colors) === JSON.stringify(customTheme));
      if (presetMatch) {
        const [id, preset] = presetMatch;
        const cycleEntry = presetCycle.find(p => p.id === id);
        if (cycleEntry) return cycleEntry;
        return { id, label: preset.label, icon: <span className="text-base leading-none">{preset.emoji}</span> };
      }
      // Check user's published themes
      const userMatch = userThemeCycle.find(t => JSON.stringify(t.colors) === JSON.stringify(customTheme));
      if (userMatch) return userMatch;
    }
    return { id: 'custom', label: 'Custom', icon: <Palette className="size-5" /> };
  })();

  const cycleTheme = () => {
    // If already on Custom, navigate to theme builder instead of cycling
    if (currentThemeInfo.id === 'custom') {
      onOpenChange(false);
      navigate('/settings/theme');
      return;
    }

    const currentId = currentThemeInfo.id;
    const idx = allThemeCycle.findIndex(t => t.id === currentId);
    const nextIdx = (idx + 1) % allThemeCycle.length;
    const next = allThemeCycle[nextIdx];

    if (next.id === 'custom' && customTheme) {
      applyCustomTheme(customTheme);
    } else if (next.colors) {
      // User-published theme
      applyCustomTheme(next.colors);
    } else {
      const builtin = builtinCycle.find(b => b.id === next.id);
      if (builtin) {
        setTheme(builtin.id);
      } else if (themePresets[next.id]) {
        applyCustomTheme(themePresets[next.id].colors);
      }
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
      <SheetContent side="right" className="w-[300px] p-0 border-l-border">
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
              {/* Settings section */}
              <div className="flex items-center gap-2 px-2 pt-3 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-accent/70">
                  Settings
                </span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              {visibleSettings.map((section) => {
                const Icon = section.icon;
                return (
                  <Link
                    key={section.id}
                    to={section.path}
                    onClick={handleClose}
                    className="flex items-center gap-4 py-3.5 px-2 rounded-lg hover:bg-secondary/60 transition-colors text-[15px]"
                  >
                    <span className="text-muted-foreground"><Icon className="size-5" /></span>
                    <span className="font-medium">{section.label}</span>
                  </Link>
                );
              })}

              <div className="my-2 mx-2">
                <Separator />
              </div>

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
