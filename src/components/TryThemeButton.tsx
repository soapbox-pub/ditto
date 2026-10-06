import type { CSSProperties, MouseEvent } from 'react';
import { FormattedMessage } from 'react-intl';
import { Paintbrush } from 'lucide-react';

import { cn } from '@/lib/utils';

interface TryThemeButtonProps {
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  /** Colors to paint the pill in, e.g. the theme's own primary colors. Defaults to the app's. */
  style?: CSSProperties;
  className?: string;
}

/** "Try this theme" pill overlaid on a theme or palette card. Starts a preview; nothing is published. */
export function TryThemeButton({ onClick, style, className }: TryThemeButtonProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onClick(e);
      }}
      style={style}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-semibold shadow-md ring-1 ring-black/10',
        'bg-primary text-primary-foreground',
        'transition-transform motion-safe:hover:scale-105 motion-safe:active:scale-95',
        'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      <Paintbrush className="size-4" aria-hidden />
      <FormattedMessage id="themeContent.tryTheme" defaultMessage="Try this theme" />
    </button>
  );
}
