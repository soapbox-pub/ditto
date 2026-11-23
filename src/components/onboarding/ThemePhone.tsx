import { useEffect, useMemo, type ReactNode } from 'react';

import { ThumbnailImage } from '@/components/ThumbnailImage';
import { loadFont, sanitizeCssString } from '@/lib/fontLoader';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';
import { coreToTokens, type CoreThemeColors, type ThemeFont } from '@/themes';

const hsl = (value: string) => `hsl(${value})`;

interface ThemePhoneProps {
  colors: CoreThemeColors;
  title: string;
  font?: ThemeFont;
  /** Background image URL (sanitized here). */
  background?: string;
  /** Label on the screen's button, e.g. "Try it". Omitted, the button is drawn blank. */
  action?: ReactNode;
  active?: boolean;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}

/**
 * A theme on a little phone: its background, a header and two posts in its
 * colors, its title in its font, and a button in its accent. Used wherever
 * onboarding shows a theme, so picking one and meeting the people who make
 * them look the same.
 */
export function ThemePhone({ colors, title, font, background, action, active, onClick, ariaLabel, className }: ThemePhoneProps) {
  const tokens = useMemo(() => coreToTokens(colors), [colors]);
  const bg = sanitizeUrl(background);

  useEffect(() => {
    if (font?.family) loadFont(font.family, sanitizeUrl(font.url)).catch(() => {});
  }, [font?.family, font?.url]);

  const fontFamily = font?.family ? `"${sanitizeCssString(font.family)}", sans-serif` : undefined;
  const card = `hsl(${tokens.card} / 0.88)`;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={ariaLabel}
      aria-pressed={active}
      className={cn(
        'relative block aspect-[9/16] w-full overflow-hidden rounded-[22px] border-[5px] border-neutral-900 bg-neutral-900 transition-transform',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:hover:-translate-y-0.5',
        active && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className,
      )}
      style={{ backgroundColor: hsl(tokens.background) }}
    >
      {bg && <ThumbnailImage key={bg} src={bg} alt="" className="absolute inset-0 size-full object-cover" />}
      <span className="absolute left-1/2 top-1.5 h-1.5 w-8 -translate-x-1/2 rounded-full bg-neutral-900" />
      <div className="absolute inset-x-2 top-5 space-y-1.5">
        <div className="rounded-md px-2 py-1.5" style={{ backgroundColor: card }}>
          <p className="truncate text-left text-[11px] font-semibold" style={{ color: hsl(tokens.foreground), fontFamily }}>{title}</p>
        </div>
        {[0.75, 0.5].map((w) => (
          <div key={w} className="space-y-1 rounded-md p-2" style={{ backgroundColor: card }}>
            <span className="block h-1 rounded-full" style={{ width: `${w * 100}%`, backgroundColor: hsl(tokens.foreground), opacity: 0.55 }} />
            <span className="block h-1 w-2/5 rounded-full" style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.4 }} />
          </div>
        ))}
      </div>
      <span
        className="absolute bottom-3 left-1/2 flex h-6 min-w-14 max-w-[85%] -translate-x-1/2 items-center justify-center rounded-full px-3 text-[10px] font-semibold leading-none whitespace-nowrap"
        style={{ backgroundColor: hsl(tokens.primary), color: hsl(tokens.primaryForeground), fontFamily: 'Inter Variable, Inter, system-ui, sans-serif' }}
      >
        {action}
      </span>
    </button>
  );
}
