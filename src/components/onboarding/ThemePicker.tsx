import { Check } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { ThemeMockup } from '@/components/ThemeContent';
import { useTheme } from '@/hooks/useTheme';
import { builtinThemeLabels } from '@/lib/themeLabels';
import { cn } from '@/lib/utils';
import { resolveThemeConfig, themePresets } from '@/themes';

/** How many themes onboarding offers: light, dark, and the featured presets. */
const LIMIT = 6;

/**
 * The onboarding theme picker: light, dark and the featured presets as the
 * same theme cards the feed shows, laid out the way the feed shows them (one
 * column on phones, two on wider screens). Tapping one applies it.
 */
export function ThemePicker() {
  const intl = useIntl();
  const { theme, customTheme, themes, setTheme, applyCustomTheme } = useTheme();

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

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[...builtins, ...presets].slice(0, LIMIT).map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.active}
          onClick={item.select}
          className={cn(
            'rounded-xl text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            item.active && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
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
    </div>
  );
}
