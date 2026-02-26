import { useMemo, useCallback, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { type Theme } from '@/contexts/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { usePublishTheme } from '@/hooks/usePublishTheme';
import { builtinThemes, themePresets, coreToTokens, resolveTheme, type CoreThemeColors, type ThemeTokens, type ThemeConfig } from '@/themes';
import { hslStringToHex, hexToHslString } from '@/lib/colorUtils';
import { ColorPicker } from '@/components/ui/color-picker';
import { FontPicker } from '@/components/FontPicker';
import { BackgroundPicker } from '@/components/BackgroundPicker';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

/** Extracts HSL color string from a theme token value like "258 70% 55%" */
function hsl(value: string): string {
  return `hsl(${value})`;
}

/** Core color keys exposed in the editor, in display order */
const CORE_KEYS: (keyof CoreThemeColors)[] = ['primary', 'text', 'background'];

/** Human-readable labels for core color keys */
const COLOR_LABELS: Record<keyof CoreThemeColors, string> = {
  primary: 'Primary',
  text: 'Text',
  background: 'Background',
};

/** Get the effective CoreThemeColors for the current theme */
function getEffectiveColors(theme: Theme, customTheme?: ThemeConfig): CoreThemeColors {
  if (theme === 'custom' && customTheme) return customTheme.colors;
  const resolved = resolveTheme(theme);
  if (resolved === 'custom' && customTheme) return customTheme.colors;
  return builtinThemes[resolved as 'light' | 'dark'] ?? builtinThemes.dark;
}

/** Mini preview card for a theme with known tokens */
function ThemePreviewCard({
  colors,
  isActive,
  backgroundUrl,
  children,
}: {
  colors: CoreThemeColors;
  isActive: boolean;
  backgroundUrl?: string;
  children?: React.ReactNode;
}) {
  const tokens = useMemo(() => coreToTokens(colors), [colors]);

  return (
    <>
      {/* Mini preview */}
      <div
        className="aspect-[4/3] rounded-lg overflow-hidden relative"
        style={{ backgroundColor: hsl(tokens.background) }}
      >
        {/* Background image layer */}
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        {/* Simulated header bar */}
        <div
          className="h-2.5 w-full relative"
          style={{ backgroundColor: hsl(tokens.card) }}
        />
        {/* Content preview area */}
        <div className="p-1.5 space-y-1 relative">
          {/* Simulated text lines */}
          <div
            className="h-1 w-3/4 rounded-full"
            style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.6 }}
          />
          <div
            className="h-1 w-1/2 rounded-full"
            style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.4 }}
          />
          {/* Simulated button */}
          <div className="pt-0.5">
            <div
              className="h-2 w-8 rounded-sm"
              style={{ backgroundColor: hsl(tokens.primary) }}
            />
          </div>
        </div>
        {/* Simulated sidebar strip */}
        <div
          className="absolute right-0 top-0 bottom-0 w-4"
          style={{ backgroundColor: hsl(tokens.secondary) }}
        />

        {/* Active check mark */}
        {isActive && (
          <div className="absolute top-1 left-1 size-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: hsl(tokens.primary) }}
          >
            <Check className="size-2.5" style={{ color: hsl(tokens.primaryForeground) }} />
          </div>
        )}

        {children}
      </div>
    </>
  );
}

export function ThemeSelector() {
  const { theme, customTheme, setTheme, applyCustomTheme } = useTheme();
  const { user } = useCurrentUser();
  const activeProfileTheme = useActiveProfileTheme(user?.pubkey);
  const { setActiveTheme, clearActiveTheme } = usePublishTheme();
  const { toast } = useToast();
  const [isSharing, setIsSharing] = useState(false);

  /** Whether the user has an active profile theme published. */
  const isShared = !!activeProfileTheme.data;

  /** Toggle sharing the theme to others via kind 11667. */
  const handleShareToggle = useCallback(async (checked: boolean) => {
    if (!user) return;
    setIsSharing(true);
    try {
      if (checked) {
        const colors = getEffectiveColors(theme, customTheme);
        await setActiveTheme({ themeConfig: customTheme ?? { colors } });
        toast({ title: 'Theme shared', description: 'Your theme is now visible on your profile.' });
      } else {
        await clearActiveTheme();
        toast({ title: 'Theme hidden', description: 'Your theme is no longer visible on your profile.' });
      }
    } catch {
      toast({ title: 'Failed to update', description: 'Could not update your theme visibility.', variant: 'destructive' });
    } finally {
      setIsSharing(false);
    }
  }, [user, theme, customTheme, setActiveTheme, clearActiveTheme, toast]);

  const builtinOptions: { id: Theme; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];

  const presetOptions = Object.entries(themePresets).map(([id, preset]) => ({
    id,
    label: preset.label,
    colors: preset.colors,
    font: preset.font,
    background: preset.background,
  }));

  /** Check if a preset matches the current custom theme colors */
  const isPresetActive = (presetColors: CoreThemeColors): boolean => {
    if (theme !== 'custom' || !customTheme) return false;
    return JSON.stringify(customTheme.colors) === JSON.stringify(presetColors);
  };

  /** The effective colors for the current theme (used in the color editor) */
  const effectiveColors = getEffectiveColors(theme, customTheme);

  /** Handle a color change from the inline editor */
  const handleColorChange = useCallback((key: keyof CoreThemeColors, hex: string) => {
    const hslValue = hexToHslString(hex);
    const newColors = { ...effectiveColors, [key]: hslValue };
    applyCustomTheme(newColors);
  }, [effectiveColors, applyCustomTheme]);

   return (
    <div className="space-y-5">
      {/* ── Customize card: colors, font, share toggle ── */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        {/* Colors */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Colors
          </h3>
          <div className="flex items-start justify-center gap-6 sidebar:justify-start sidebar:gap-8">
            {CORE_KEYS.map((key) => (
              <ColorPicker
                key={key}
                label={COLOR_LABELS[key]}
                value={hslStringToHex(effectiveColors[key])}
                onChange={(hex) => handleColorChange(key, hex)}
              />
            ))}
          </div>
        </div>

        {/* Font */}
        <FontPicker />

        {/* Background */}
        <BackgroundPicker />

        {/* Share toggle */}
        {user && (
          <div className="flex items-center justify-between pt-1">
            <Label htmlFor="share-theme" className="flex flex-col gap-1 cursor-pointer">
              <span className="text-sm font-medium">Display my theme to others</span>
              <span className="text-xs text-muted-foreground font-normal">
                Share your current theme on your profile
              </span>
            </Label>
            {isSharing ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                id="share-theme"
                checked={isShared}
                onCheckedChange={handleShareToggle}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Themes grid ── */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Themes
        </h3>
        <div className="grid grid-cols-2 sidebar:grid-cols-3 gap-3">
          {builtinOptions.map((option) => {
            if (option.id === 'system') {
              const isActive = theme === 'system';
              const lightTokens = coreToTokens(builtinThemes.light);
              const darkTokens = coreToTokens(builtinThemes.dark);

              return (
                <button
                  key="system"
                  className={cn(
                    'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'border-primary shadow-sm'
                      : 'border-border hover:border-primary/40',
                  )}
                  onClick={() => setTheme('system')}
                >
                  {/* Split preview: left light, right dark */}
                  <div className="aspect-[4/3] rounded-lg overflow-hidden relative">
                    {/* Light half */}
                    <SystemHalf tokens={lightTokens} side="left" />
                    {/* Dark half */}
                    <SystemHalf tokens={darkTokens} side="right" />

                    {/* Active check mark */}
                    {isActive && (
                      <div className="absolute top-1 left-1 size-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: hsl(lightTokens.primary) }}
                      >
                        <Check className="size-2.5" style={{ color: hsl(lightTokens.primaryForeground) }} />
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <p className={cn(
                    'mt-1.5 text-xs font-medium text-center transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {option.label}
                  </p>
                </button>
              );
            }

            // Light / Dark builtin
            const colors = builtinThemes[option.id as 'light' | 'dark'];
            const isActive = theme === option.id;

            return (
              <button
                key={option.id}
                className={cn(
                  'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() => setTheme(option.id)}
              >
                <ThemePreviewCard colors={colors} isActive={isActive} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {option.label}
                </p>
              </button>
            );
          })}

          {/* Preset buttons */}
          {presetOptions.map((preset) => {
            const isActive = isPresetActive(preset.colors);

            return (
              <button
                key={preset.id}
                className={cn(
                  'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() => applyCustomTheme({ colors: preset.colors, font: preset.font, background: preset.background })}
              >
                <ThemePreviewCard colors={preset.colors} isActive={isActive} backgroundUrl={preset.background?.url} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {preset.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Half of the system theme preview (light or dark side) */
function SystemHalf({ tokens, side }: { tokens: ThemeTokens; side: 'left' | 'right' }) {
  return (
    <div
      className={cn('absolute inset-0', side === 'right' && 'left-1/2')}
      style={{ backgroundColor: hsl(tokens.background), ...(side === 'left' ? { width: '50%' } : {}) }}
    >
      <div className="h-2.5 w-full" style={{ backgroundColor: hsl(tokens.card) }} />
      <div className="p-1.5 space-y-1">
        <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.6 }} />
        <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.4 }} />
        <div className="pt-0.5">
          <div className="h-2 w-8 rounded-sm" style={{ backgroundColor: hsl(tokens.primary) }} />
        </div>
      </div>
    </div>
  );
}
