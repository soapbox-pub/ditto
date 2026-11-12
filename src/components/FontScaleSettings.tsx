import { FormattedMessage, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  FONT_SCALE_DEFAULT,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  setFontScale,
  useFontScale,
} from '@/lib/fontScale';

export function FontScaleSettings() {
  const intl = useIntl();
  const scale = useFontScale();
  const label = intl.formatMessage({ id: 'settings.personalize.textSize', defaultMessage: 'Text size' });
  const percent = intl.formatNumber(scale / 100, { style: 'percent' });

  return (
    <div className="space-y-3">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">
          <FormattedMessage id="settings.personalize.textSizeDescription" defaultMessage="Scales text across the app on this device" />
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Slider
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={5}
          value={[scale]}
          onValueChange={([v]) => setFontScale(v)}
          aria-label={label}
          aria-valuetext={percent}
          className="flex-1 py-2"
        />
        <span className="w-12 shrink-0 text-right text-sm tabular-nums">{percent}</span>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          disabled={scale === FONT_SCALE_DEFAULT}
          onClick={() => setFontScale(FONT_SCALE_DEFAULT)}
        >
          <FormattedMessage id="settings.personalize.textSizeReset" defaultMessage="Reset" />
        </Button>
      </div>
    </div>
  );
}
