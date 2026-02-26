import { useMemo } from 'react';
import { Check, Globe, Plus, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { type Theme } from '@/contexts/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserThemes } from '@/hooks/useUserThemes';
import { builtinThemes, themePresets, coreToTokens, type CoreThemeColors, type ThemeTokens } from '@/themes';
import { cn } from '@/lib/utils';

/** Extracts HSL color string from a theme token value like "258 70% 55%" */
function hsl(value: string): string {
  return `hsl(${value})`;
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
  const { user } = useCurrentUser();
  const userThemesQuery = useUserThemes(user?.pubkey);

  const hasUserThemes = (userThemesQuery.data?.length ?? 0) > 0;

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

  return (
    <div className="space-y-5">

      {/* ── My Themes section ── */}
      {user && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Themes</h3>
          <div className="grid grid-cols-3 gap-3">
            {/* Create new custom theme */}
            <Link
              to="/settings/theme?new"
              className="relative group rounded-xl border-2 border-dashed p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring border-border hover:border-accent/40"
            >
              <div className="aspect-[4/3] rounded-lg overflow-hidden relative flex flex-col items-center justify-center gap-1.5 bg-muted/30">
                <Plus className="size-5 text-muted-foreground group-hover:text-accent transition-colors" />
                <span className="text-[10px] text-muted-foreground group-hover:text-accent transition-colors font-medium">New</span>
              </div>
              <p className="mt-1.5 text-xs font-medium text-center text-muted-foreground group-hover:text-foreground transition-colors">
                Create Theme
              </p>
            </Link>

            {/* User's published themes */}
            {userThemesQuery.data?.map((userTheme) => {
              const isActive = theme === 'custom' && customTheme && JSON.stringify(customTheme) === JSON.stringify(userTheme.colors);

              return (
                <div key={`user-${userTheme.identifier}`} className="relative group">
                  <button
                    className={cn(
                      'w-full rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left',
                      isActive
                        ? 'border-primary shadow-sm'
                        : 'border-border hover:border-primary/40',
                    )}
                    onClick={() => applyCustomTheme(userTheme.colors)}
                  >
                    <ThemePreviewCard colors={userTheme.colors} isActive={!!isActive} />
                    <p className={cn(
                      'mt-1.5 text-xs font-medium text-center transition-colors truncate',
                      isActive ? 'text-foreground' : 'text-muted-foreground',
                    )}>
                      {userTheme.title}
                    </p>
                  </button>
                  {/* Edit button overlay */}
                  <Link
                    to={`/settings/theme?edit=${userTheme.identifier}`}
                    className="absolute top-2.5 right-2.5 size-6 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-secondary"
                    title="Edit theme"
                  >
                    <Pencil className="size-3 text-muted-foreground" />
                  </Link>
                </div>
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
        </div>
      )}

      {/* ── Presets section ── */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          {hasUserThemes ? 'Presets' : 'Themes'}
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
                onClick={() => applyCustomTheme(preset.colors)}
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

          {/* Browse public themes — shown in presets section when user has no custom themes */}
          {!user && (
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
          )}
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
