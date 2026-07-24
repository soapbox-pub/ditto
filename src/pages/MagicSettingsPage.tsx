import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useIntl } from 'react-intl';
import { PageHeader } from '@/components/PageHeader';
import { IntroImage } from '@/components/IntroImage';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';

export function MagicSettingsPage() {
  const intl = useIntl();
  const { config, updateConfig } = useAppContext();

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.magic.title', defaultMessage: "Magic" })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.magic.metaDescription', defaultMessage: "Magical cursor effects and enchanted interface settings" }),
  });

  function toggleMagicMouse(checked: boolean) {
    updateConfig((c) => ({ ...c, magicMouse: checked }));
  }

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{intl.formatMessage({ id: 'settings.magic.title', defaultMessage: "Magic" })}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {intl.formatMessage({ id: 'settings.magic.subtitle', defaultMessage: "Harness the mystical energies of your device. Imbue your cursor with elemental fire." })}
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Intro */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-6">
          <IntroImage src="/magic-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{intl.formatMessage({ id: 'settings.magic.introTitle', defaultMessage: "Arcane Configuration" })}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {intl.formatMessage({ id: 'settings.magic.introDescription', defaultMessage: "Harness the mystical energies of your device. Imbue your cursor with elemental fire and make every interaction feel enchanted." })}
            </p>
          </div>
        </div>

        {/* Ornament */}
        <div className="flex items-center gap-3 px-2 pb-5">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/40 to-primary/60" />
          <span className="text-primary/50 text-xs tracking-[0.3em] select-none">✦</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/40 to-primary/60" />
        </div>

        {/* Magic Mouse toggle */}
        <div
          className="flex items-start gap-4 rounded-xl px-4 py-4 transition-colors hover:bg-muted/40"
          style={{ background: config.magicMouse ? 'radial-gradient(ellipse 120% 80% at 50% 50%, hsl(var(--primary) / 0.07), transparent)' : undefined }}
        >
          <div className="flex-1 min-w-0">
            <Label htmlFor="magic-mouse-toggle" className="text-sm font-semibold cursor-pointer flex items-center gap-1.5">
              {intl.formatMessage({ id: 'settings.magic.magicMouse', defaultMessage: "Magic Mouse" })}
            </Label>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {intl.formatMessage({ id: 'settings.magic.magicMouseDescription', defaultMessage: "Your cursor (or finger on touch devices) will emanate magical fire in the glow of your primary color. Move with purpose — every path you trace becomes a trail of flame." })}
            </p>
          </div>
          <Switch
            id="magic-mouse-toggle"
            checked={config.magicMouse}
            onCheckedChange={toggleMagicMouse}
            className="mt-0.5 shrink-0"
          />
        </div>

        {/* Bottom ornament */}
        <div className="flex items-center gap-3 px-2 pt-6 pb-4">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent via-primary/20 to-primary/30" />
          <span className="text-primary/30 text-[10px] tracking-[0.4em] select-none">◆</span>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent via-primary/20 to-primary/30" />
        </div>
      </div>
    </main>
  );
}
