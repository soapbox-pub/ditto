import { useMemo, type ReactNode } from 'react';

import type { CoreThemeColors } from '@/themes';
import { coreToTokens, toThemeVar } from '@/themes';
import { isDarkTheme } from '@/lib/colorUtils';

interface ScopedThemeProps {
  /** The core theme colors to apply within this scope */
  colors: CoreThemeColors;
  /** Content to render within the themed scope */
  children: ReactNode;
  /** Additional className for the wrapper div */
  className?: string;
}

/**
 * Applies custom CSS variable overrides scoped to a container.
 * Child components using `bg-background`, `text-foreground`, etc. will
 * pick up the scoped values instead of the global ones.
 *
 * Also sets a `data-theme-mode` attribute for CSS targeting.
 */
export function ScopedTheme({ colors, children, className }: ScopedThemeProps) {
  const style = useMemo(() => {
    const tokens = coreToTokens(colors);
    const vars: Record<string, string> = {};
    for (const [key, val] of Object.entries(tokens) as [string, string][]) {
      vars[toThemeVar(key)] = val;
    }
    return vars;
  }, [colors]);

  const mode = isDarkTheme(colors.background) ? 'dark' : 'light';

  return (
    <div style={style} data-theme-mode={mode} className={className}>
      {children}
    </div>
  );
}
