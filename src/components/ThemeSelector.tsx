import { Check, Paintbrush, Globe } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type Theme } from '@/contexts/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { builtinThemes, themePresets, type ThemeTokens } from '@/themes';
import { cn } from '@/lib/utils';

/** Extracts HSL color string from a theme token value like "258 70% 55%" */
function hsl(value: string): string {
  return `hsl(${value})`;
}

/** Mini preview card for a theme with known tokens */
function ThemePreviewCard({
  tokens,
  isActive,
  children,
}: {
  tokens: ThemeTokens;
  isActive: boolean;
  children?: React.ReactNode;
}) {
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

  const builtinOptions: { id: Theme; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];

  const presetOptions = Object.entries(themePresets).map(([id, preset]) => ({
    id,
    label: preset.label,
    tokens: preset.tokens,
  }));

  /** Check if a preset matches the current custom theme tokens */
  const isPresetActive = (presetTokens: ThemeTokens): boolean => {
    if (theme !== 'custom' || !customTheme) return false;
    return JSON.stringify(customTheme) === JSON.stringify(presetTokens);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
          {builtinOptions.map((option) => {
            if (option.id === 'system') {
              const isActive = theme === 'system';
              const lightTokens = builtinThemes.light;
              const darkTokens = builtinThemes.dark;

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
                    <div
                      className="absolute inset-0 w-1/2"
                      style={{ backgroundColor: hsl(lightTokens.background) }}
                    >
                      <div className="h-2.5 w-full" style={{ backgroundColor: hsl(lightTokens.card) }} />
                      <div className="p-1.5 space-y-1">
                        <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: hsl(lightTokens.foreground), opacity: 0.6 }} />
                        <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: hsl(lightTokens.mutedForeground), opacity: 0.4 }} />
                        <div className="pt-0.5">
                          <div className="h-2 w-8 rounded-sm" style={{ backgroundColor: hsl(lightTokens.primary) }} />
                        </div>
                      </div>
                    </div>
                    {/* Dark half */}
                    <div
                      className="absolute inset-0 left-1/2"
                      style={{ backgroundColor: hsl(darkTokens.background) }}
                    >
                      <div className="h-2.5 w-full" style={{ backgroundColor: hsl(darkTokens.card) }} />
                      <div className="p-1.5 space-y-1">
                        <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: hsl(darkTokens.foreground), opacity: 0.6 }} />
                        <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: hsl(darkTokens.mutedForeground), opacity: 0.4 }} />
                        <div className="pt-0.5">
                          <div className="h-2 w-8 rounded-sm" style={{ backgroundColor: hsl(darkTokens.primary) }} />
                        </div>
                      </div>
                    </div>

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
            const tokens = builtinThemes[option.id as 'light' | 'dark'];
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
                <ThemePreviewCard tokens={tokens} isActive={isActive} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {option.label}
                </p>
              </button>
            );
          })}

          {/* Active custom theme (if it doesn't match any preset) */}
          {theme === 'custom' && customTheme && !presetOptions.some(p => isPresetActive(p.tokens)) && (
            <button
              key="custom-active"
              className="relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-primary shadow-sm"
            >
              <ThemePreviewCard tokens={customTheme} isActive />
              <p className="mt-1.5 text-xs font-medium text-center transition-colors text-foreground">
                Custom
              </p>
            </button>
          )}

          {/* Preset buttons */}
          {presetOptions.map((preset) => {
            const isActive = isPresetActive(preset.tokens);

            return (
              <button
                key={preset.id}
                className={cn(
                  'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() => applyCustomTheme(preset.tokens)}
              >
                <ThemePreviewCard tokens={preset.tokens} isActive={isActive} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {preset.label}
                </p>
              </button>
            );
          })}

          {/* Browse public themes */}
          <Link
            to="/themes"
            className="relative group rounded-xl border-2 border-dashed p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-border hover:border-primary/40"
          >
            <div className="aspect-[4/3] rounded-lg overflow-hidden relative flex flex-col items-center justify-center gap-1.5 bg-muted/30">
              <Globe className="size-5 text-muted-foreground group-hover:text-primary transition-colors" />
              <span className="text-[10px] text-muted-foreground group-hover:text-primary transition-colors font-medium">Browse</span>
            </div>
            <p className="mt-1.5 text-xs font-medium text-center text-muted-foreground group-hover:text-foreground transition-colors">
              Public Themes
            </p>
          </Link>
        </div>

        {/* Customize link */}
        <Link
          to="/settings/theme"
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
        >
          <Paintbrush className="size-4" />
          Customize your own theme
        </Link>
    </div>
  );
}
