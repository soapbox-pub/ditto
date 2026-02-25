import { useMemo, type ReactNode } from 'react';

import type { ThemeTokens } from '@/themes';
import { toThemeVar } from '@/themes';
import { isDarkTheme } from '@/lib/colorUtils';

interface ScopedThemeProps {
  /** The custom theme tokens to apply within this scope */
  tokens: ThemeTokens;
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
export function ScopedTheme({ tokens, children, className }: ScopedThemeProps) {
  const style = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, val] of Object.entries(tokens) as [string, string][]) {
      vars[toThemeVar(key)] = val;
    }
    return vars;
  }, [tokens]);

  const mode = isDarkTheme(tokens.background) ? 'dark' : 'light';

  return (
    <div style={style} data-theme-mode={mode} className={className}>
      {children}
    </div>
  );
}
