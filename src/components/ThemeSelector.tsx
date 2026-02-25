import { Check, Plus } from 'lucide-react';
import { type Theme } from '@/contexts/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { themes, type ThemeTokens } from '@/themes';
import { cn } from '@/lib/utils';

interface ThemeOption {
  id: Theme | 'custom';
  label: string;
  tokens?: ThemeTokens;
}

const themeOptions: ThemeOption[] = [
  { id: 'light', label: 'Light', tokens: themes.light },
  { id: 'dark', label: 'Dark', tokens: themes.dark },
  { id: 'black', label: 'Black', tokens: themes.black },
  { id: 'pink', label: 'Pink', tokens: themes.pink },
  { id: 'custom', label: 'Custom' },
];

/** Extracts HSL color string from a theme token value like "258 70% 55%" */
function hsl(value: string): string {
  return `hsl(${value})`;
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {themeOptions.map((option) => {
          if (option.id === 'custom') {
            return (
              <button
                key="custom"
                className={cn(
                  'relative group rounded-xl border-2 border-dashed border-muted-foreground/25 p-1 transition-all hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
                onClick={() => {
                  // Custom theme builder placeholder -- navigates or opens modal in future
                }}
                title="Custom theme builder (coming soon)"
              >
                <div className="aspect-[4/3] rounded-lg bg-muted/30 flex flex-col items-center justify-center gap-1.5">
                  <Plus className="size-5 text-muted-foreground/50" />
                  <span className="text-[10px] font-medium text-muted-foreground/60">Coming soon</span>
                </div>
                <p className="mt-1.5 text-xs font-medium text-center text-muted-foreground">
                  {option.label}
                </p>
              </button>
            );
          }

          const tokens = option.tokens!;
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
              onClick={() => setTheme(option.id as Theme)}
            >
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
                  style={{ backgroundColor: hsl(tokens.sidebarBackground) }}
                />

                {/* Active check mark */}
                {isActive && (
                  <div className="absolute top-1 left-1 size-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: hsl(tokens.primary) }}
                  >
                    <Check className="size-2.5" style={{ color: hsl(tokens.primaryForeground) }} />
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
        })}
      </div>
    </div>
  );
}
