import { useMemo, useState, useCallback } from 'react';
import { Check, SlidersHorizontal } from 'lucide-react';
import { type Theme } from '@/contexts/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { builtinThemes, themePresets, coreToTokens, type CoreThemeColors, type ThemeTokens } from '@/themes';
import { hslStringToHex, hexToHslString } from '@/lib/colorUtils';
import { ColorPicker } from '@/components/ui/color-picker';
import { cn } from '@/lib/utils';

/** Extracts HSL color string from a theme token value like "258 70% 55%" */
function hsl(value: string): string {
  return `hsl(${value})`;
}

/** Core color keys exposed in the custom editor, in display order */
const CORE_KEYS: (keyof CoreThemeColors)[] = ['primary', 'text', 'background'];

/** Human-readable labels for core color keys */
const COLOR_LABELS: Record<keyof CoreThemeColors, string> = {
  primary: 'Primary',
  text: 'Text',
  background: 'Background',
};

/** Check if customTheme matches any known preset */
function matchesAnyPreset(customTheme: CoreThemeColors): boolean {
  const json = JSON.stringify(customTheme);
  for (const preset of Object.values(themePresets)) {
    if (JSON.stringify(preset.colors) === json) return true;
  }
  return false;
}

/** Mini preview card for a theme with known tokens */
function ThemePreviewCard({
  colors,
  isActive,
  children,
}: {
  colors: CoreThemeColors;
  isActive: boolean;
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
        {/* Simulated header bar */}
        <div
          className="h-2.5 w-full"
          style={{ backgroundColor: hsl(tokens.card) }}
        />
        {/* Content preview area */}
        <div className="p-1.5 space-y-1">
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

  // Determine if "Custom" should be the active selection on mount:
  // theme === 'custom' AND customTheme doesn't match any preset
  const isCustomOnMount = theme === 'custom' && !!customTheme && !matchesAnyPreset(customTheme);

  // Track whether the user has explicitly selected "Custom"
  const [customSelected, setCustomSelected] = useState(isCustomOnMount);

  const builtinOptions: { id: Theme; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];

  const presetOptions = Object.entries(themePresets).map(([id, preset]) => ({
    id,
    label: preset.label,
    colors: preset.colors,
  }));

  /** Check if a preset matches the current custom theme colors */
  const isPresetActive = (presetColors: CoreThemeColors): boolean => {
    if (theme !== 'custom' || !customTheme) return false;
    return JSON.stringify(customTheme) === JSON.stringify(presetColors);
  };

  /** Whether the Custom option card is highlighted */
  const isCustomActive = customSelected && theme === 'custom';

  /** The colors currently shown in the custom editor */
  const editingColors: CoreThemeColors = customTheme ?? builtinThemes.dark;

  /** Handle selecting a builtin theme (system/light/dark) */
  const handleBuiltinSelect = useCallback((id: Theme) => {
    setCustomSelected(false);
    setTheme(id);
  }, [setTheme]);

  /** Handle selecting a preset theme */
  const handlePresetSelect = useCallback((colors: CoreThemeColors) => {
    setCustomSelected(false);
    applyCustomTheme(colors);
  }, [applyCustomTheme]);

  /** Handle selecting the Custom option */
  const handleCustomSelect = useCallback(() => {
    setCustomSelected(true);
    // If not already on a custom theme, apply the current builtin as a starting point
    if (theme !== 'custom' || !customTheme) {
      const startColors = theme === 'light' || theme === 'dark'
        ? builtinThemes[theme]
        : builtinThemes.dark;
      applyCustomTheme(startColors);
    }
  }, [theme, customTheme, applyCustomTheme]);

  /** Handle a color change from the inline editor */
  const handleColorChange = useCallback((key: keyof CoreThemeColors, hex: string) => {
    const hslValue = hexToHslString(hex);
    const newColors = { ...editingColors, [key]: hslValue };
    applyCustomTheme(newColors);
  }, [editingColors, applyCustomTheme]);

  return (
    <div className="space-y-5">
      {/* ── Themes grid ── */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Themes
        </h3>
        <div className="grid grid-cols-3 gap-3">
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
                  onClick={() => handleBuiltinSelect('system')}
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
                onClick={() => handleBuiltinSelect(option.id)}
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
            const isActive = isPresetActive(preset.colors) && !customSelected;

            return (
              <button
                key={preset.id}
                className={cn(
                  'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() => handlePresetSelect(preset.colors)}
              >
                <ThemePreviewCard colors={preset.colors} isActive={isActive} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {preset.label}
                </p>
              </button>
            );
          })}

          {/* Custom option */}
          <button
            className={cn(
              'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isCustomActive
                ? 'border-primary shadow-sm'
                : 'border-border hover:border-primary/40',
            )}
            onClick={handleCustomSelect}
          >
            <div className="aspect-[4/3] rounded-lg overflow-hidden relative flex flex-col items-center justify-center gap-1.5 bg-muted/30">
              <SlidersHorizontal className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
              {isCustomActive && (
                <div className="absolute top-1 left-1 size-4 rounded-full bg-primary flex items-center justify-center">
                  <Check className="size-2.5 text-primary-foreground" />
                </div>
              )}
            </div>
            <p className={cn(
              'mt-1.5 text-xs font-medium text-center transition-colors',
              isCustomActive ? 'text-foreground' : 'text-muted-foreground',
            )}>
              Custom
            </p>
          </button>
        </div>
      </div>

      {/* ── Custom color editor ── */}
      {isCustomActive && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4 animate-in fade-in-0 slide-in-from-top-2 duration-200">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Custom Colors
          </h3>
          <div className="space-y-2">
            {CORE_KEYS.map((key) => (
              <ColorPicker
                key={key}
                label={COLOR_LABELS[key]}
                value={hslStringToHex(editingColors[key])}
                onChange={(hex) => handleColorChange(key, hex)}
              />
            ))}
          </div>
        </div>
      )}
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
