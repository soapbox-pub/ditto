import { useCallback, useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { ThemeMockup } from '@/components/ThemeContent';
import { useTheme } from '@/hooks/useTheme';
import { builtinThemeLabels } from '@/lib/themeLabels';
import { cn } from '@/lib/utils';
import { resolveThemeConfig, themePresets } from '@/themes';

/** How many themes onboarding offers: light, dark, and the featured presets. */
const LIMIT = 9;

/**
 * The onboarding theme picker: light, dark and the featured presets as the
 * feed's theme cards in a centered carousel. One card sits in the middle with
 * its neighbours peeking in; tapping a card applies it, and the carousel opens
 * on whichever is in use.
 */
export function ThemePicker() {
  const intl = useIntl();
  const { theme, customTheme, themes, setTheme, applyCustomTheme } = useTheme();
  const scroller = useRef<HTMLDivElement>(null);
  const [centered, setCentered] = useState(0);

  const builtins = (['light', 'dark'] as const).map((id) => ({
    key: id,
    title: intl.formatMessage(builtinThemeLabels[id]),
    config: resolveThemeConfig(id, themes),
    active: theme === id,
    select: () => setTheme(id),
  }));

  const presets = Object.entries(themePresets)
    .filter(([, preset]) => preset.featured)
    .map(([id, preset]) => ({
      key: id,
      title: intl.formatMessage(preset.label),
      config: preset,
      active: theme === 'custom' && JSON.stringify(customTheme?.colors) === JSON.stringify(preset.colors),
      select: () => applyCustomTheme({ colors: preset.colors, font: preset.font, titleFont: preset.titleFont, background: preset.background }),
    }));

  const items = [...builtins, ...presets].slice(0, LIMIT);
  const activeIndex = items.findIndex((item) => item.active);

  const scrollTo = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const el = scroller.current;
    const card = el?.querySelectorAll<HTMLElement>('[data-card]')[index];
    if (!el || !card) return;
    el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.clientWidth) / 2, behavior });
  }, []);

  // Open centred on the theme in use, or the first. Snapping only applies once
  // the row scrolls, so place it ourselves.
  useEffect(() => {
    const index = Math.max(0, activeIndex);
    scrollTo(index, 'instant');
    setCentered(index);
    // Only on mount; afterwards the user is driving.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const middle = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    el.querySelectorAll<HTMLElement>('[data-card]').forEach((c, i) => {
      const distance = Math.abs(c.offsetLeft + c.clientWidth / 2 - middle);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setCentered(best);
  };

  return (
    <div>
      <div
        ref={scroller}
        onScroll={onScroll}
        className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth pt-1 pb-3 scrollbar-none"
      >
        {/* Spacers sized off the row itself, so the first and last cards can sit centred. */}
        <span aria-hidden className="w-[calc(12%-0.75rem)] shrink-0" />
        {items.map((item, i) => (
          <button
            key={item.key}
            data-card
            type="button"
            aria-pressed={item.active}
            onClick={() => {
              item.select();
              scrollTo(i);
            }}
            className={cn(
              'w-[76%] shrink-0 snap-center rounded-xl text-left transition-[transform,opacity] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              item.active && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
              i !== centered && 'motion-safe:scale-95 opacity-70',
            )}
          >
            <ThemeMockup
              colors={item.config.colors}
              title={item.title}
              backgroundUrl={item.config.background?.url}
              renderAction={(tokens) => (
                <span
                  className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-xs font-semibold"
                  style={{ backgroundColor: `hsl(${tokens.primary})`, color: `hsl(${tokens.primaryForeground})` }}
                >
                  {item.active
                    ? <><Check className="size-3.5" strokeWidth={3} /><FormattedMessage id="onboarding.theme.selected" defaultMessage="Selected" /></>
                    : <FormattedMessage id="onboarding.theme.use" defaultMessage="Use" />}
                </span>
              )}
            />
          </button>
        ))}
        <span aria-hidden className="w-[calc(12%-0.75rem)] shrink-0" />
      </div>

      <div className="mt-1 flex justify-center gap-1.5" role="tablist">
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={i === centered}
            aria-label={item.title}
            onClick={() => scrollTo(i)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === centered ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50',
            )}
          />
        ))}
      </div>
    </div>
  );
}
