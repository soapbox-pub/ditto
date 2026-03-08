import { useMemo } from 'react';
import { Palette, Sun, Moon, Monitor, Check, ChevronDown } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/hooks/useTheme';
import { useUserThemes } from '@/hooks/useUserThemes';
import { useNavigate } from 'react-router-dom';
import { themePresets } from '@/themes';
import type { Theme } from '@/contexts/AppContext';
import type { CoreThemeColors, ThemeConfig } from '@/themes';

/** Maximum number of theme slots shown between the built-in options and "More..." */
const MAX_THEME_SLOTS = 5;

/** Static builtin theme option metadata (icons created at render time). */
const BUILTIN_THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const builtinIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

interface SidebarThemeDropdownProps {
  userPubkey?: string;
  onNavigate?: () => void;
  /** Extra classes on the trigger button */
  className?: string;
}

/** Compare two CoreThemeColors objects by value. */
function colorsMatch(a: CoreThemeColors, b: CoreThemeColors): boolean {
  return a.background === b.background && a.text === b.text && a.primary === b.primary;
}

interface SlotItem {
  key: string;
  label: string;
  icon: React.ReactNode;
  config: ThemeConfig;
  isActive: boolean;
}

export function SidebarThemeDropdown({ userPubkey, onNavigate, className }: SidebarThemeDropdownProps) {
  const navigate = useNavigate();
  const { theme, setTheme, applyCustomTheme, customTheme } = useTheme();
  const userThemes = useUserThemes(userPubkey);

  // Build up to MAX_THEME_SLOTS items: user themes first, then featured presets.
  const slotItems = useMemo((): SlotItem[] => {
    const items: SlotItem[] = [];

    // 1. Add user themes (already sorted newest-first by the hook).
    const userList = userThemes.data ?? [];
    for (const ut of userList) {
      if (items.length >= MAX_THEME_SLOTS) break;
      items.push({
        key: `user-${ut.identifier}`,
        label: ut.title,
        icon: <Palette className="size-3.5 text-primary shrink-0" />,
        config: { colors: ut.colors, font: ut.font, background: ut.background },
        isActive: theme === 'custom' && !!customTheme && colorsMatch(customTheme.colors, ut.colors),
      });
    }

    // 2. Fill remaining slots with featured presets (skip any whose colors duplicate a user theme already shown).
    if (items.length < MAX_THEME_SLOTS) {
      const shownColors = items.map((i) => i.config.colors);
      for (const [id, p] of Object.entries(themePresets)) {
        if (items.length >= MAX_THEME_SLOTS) break;
        if (!p.featured) continue;
        if (shownColors.some((c) => colorsMatch(c, p.colors))) continue;
        items.push({
          key: `preset-${id}`,
          label: p.label,
          icon: <span className="text-sm leading-none">{p.emoji}</span>,
          config: { colors: p.colors, font: p.font, background: p.background },
          isActive: theme === 'custom' && !!customTheme && colorsMatch(customTheme.colors, p.colors),
        });
      }
    }

    return items;
  }, [userThemes.data, theme, customTheme]);

  // Resolve current label and icon for the trigger button.
  const currentLabel = useMemo(() => {
    if (theme !== 'custom') return BUILTIN_THEMES.find((t) => t.value === theme)?.label ?? theme;
    // Check slot items for a match.
    const active = slotItems.find((s) => s.isActive);
    if (active) return active.label;
    // Check all presets (including non-featured ones, in case user picked one from /themes).
    if (customTheme) {
      const preset = Object.entries(themePresets).find(([, p]) => colorsMatch(p.colors, customTheme.colors));
      if (preset) return preset[1].label;
    }
    return 'Custom';
  }, [theme, customTheme, slotItems]);

  const currentIcon = useMemo(() => {
    const Icon = builtinIcon[theme];
    if (Icon) return <Icon className="size-4" />;
    if (theme === 'custom' && customTheme) {
      const preset = Object.entries(themePresets).find(([, p]) => colorsMatch(p.colors, customTheme.colors));
      if (preset) return <span className="text-sm leading-none">{preset[1].emoji}</span>;
    }
    return <Palette className="size-4" />;
  }, [theme, customTheme]);

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
      <DropdownMenuContent align="end" side="top" className="w-48">
        {/* Built-in options: System, Light, Dark */}
        {BUILTIN_THEMES.map((opt) => {
          const Icon = builtinIcon[opt.value];
          return (
            <DropdownMenuItem key={opt.value} onClick={() => setTheme(opt.value)} className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2">{Icon && <Icon className="size-4" />}<span>{opt.label}</span></div>
              {theme === opt.value && <Check className="size-4 text-primary" />}
            </DropdownMenuItem>
          );
        })}

        {/* Smart theme slots */}
        {slotItems.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {slotItems.map((item) => (
              <DropdownMenuItem
                key={item.key}
                onClick={() => applyCustomTheme(item.config)}
                className="flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </div>
                {item.isActive && <Check className="size-4 text-primary shrink-0" />}
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* More... link */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => { onNavigate?.(); navigate('/themes'); }} className="cursor-pointer text-muted-foreground">
          More...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
