import { Palette, Sun, Moon, Monitor, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/useTheme';
import { useUserThemes } from '@/hooks/useUserThemes';
import { useNavigate } from 'react-router-dom';
import { themePresets } from '@/themes';
import type { Theme } from '@/contexts/AppContext';

interface SidebarThemeDropdownProps {
  userPubkey?: string;
  onNavigate?: () => void;
  /** Extra classes on the trigger button */
  className?: string;
}

export function SidebarThemeDropdown({ userPubkey, onNavigate, className }: SidebarThemeDropdownProps) {
  const navigate = useNavigate();
  const { theme, setTheme, applyCustomTheme, customTheme } = useTheme();
  const userThemes = useUserThemes(userPubkey);

  const builtinOptions: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: 'system', label: 'System', icon: <Monitor className="size-4" /> },
    { value: 'light', label: 'Light', icon: <Sun className="size-4" /> },
    { value: 'dark', label: 'Dark', icon: <Moon className="size-4" /> },
  ];

  const presetOptions = Object.entries(themePresets)
    .filter(([, p]) => p.featured)
    .slice(0, 5)
    .map(([id, p]) => ({ id, label: p.label, emoji: p.emoji }));

  const activePreset = theme === 'custom' && customTheme
    ? Object.entries(themePresets).find(([, p]) => JSON.stringify(p.colors) === JSON.stringify(customTheme.colors))
    : undefined;

  const activeUserTheme = theme === 'custom' && customTheme && !activePreset
    ? userThemes.data?.find(t => JSON.stringify(t.colors) === JSON.stringify(customTheme.colors))
    : undefined;

  const currentLabel = (() => {
    if (theme !== 'custom') return builtinOptions.find(t => t.value === theme)?.label ?? theme;
    if (activePreset) return activePreset[1].label;
    if (activeUserTheme) return activeUserTheme.title;
    return 'Custom';
  })();

  const currentIcon = (() => {
    const builtin = builtinOptions.find(t => t.value === theme);
    if (builtin) return builtin.icon;
    if (activePreset) return <span className="text-sm leading-none">{activePreset[1].emoji}</span>;
    return <Palette className="size-4" />;
  })();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={className ?? 'flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium hover:bg-secondary/60 rounded-full transition-colors'}>
          <div className="flex items-center gap-3">
            <Palette className="size-4 text-muted-foreground" />
            <span>Theme</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            {currentIcon}
            <span className="text-xs">{currentLabel}</span>
            <ChevronDown className="size-4" />
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48 z-[270]">
        {builtinOptions.map((opt) => (
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
        {userThemes.data && userThemes.data.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">My Themes</DropdownMenuLabel>
            {userThemes.data.map((ut) => {
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
        <DropdownMenuItem onClick={() => { onNavigate?.(); navigate('/themes'); }} className="cursor-pointer text-muted-foreground">
          More...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
