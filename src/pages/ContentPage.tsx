import { useState } from 'react';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useTranslation } from 'react-i18next';
import { RotateCcw } from 'lucide-react';
import { MuteSettingsInternals, SensitiveContentSection, ThemePreferencesSection, VideoAutoplaySection } from '@/components/ContentSettings';
import { MuteListRecoveryDialog } from '@/components/MuteListRecoveryDialog';
import { PageHeader } from '@/components/PageHeader';
import { IntroImage } from '@/components/IntroImage';
import { HelpTip } from '@/components/HelpTip';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function ContentPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const [recoveryOpen, setRecoveryOpen] = useState(false);

  useSeoMeta({
    title: `${t('settings.sections.content.label')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.sections.content.description'),
  });

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{t('settings.sections.content.label')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('settings.content.pageDescription')}
            </p>
          </div>
        }
      />

      {/* Lead image — Content Control */}
      <div className="flex items-center gap-4 px-7 py-2">
        <IntroImage src="/mute-intro.png" size="w-28" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{t('settings.content.contentControl')}</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t('settings.content.contentControlDescription')}
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-0">

        {/* Muted Content Section */}
        <div>
          <div className="relative px-3 py-3.5 flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-1.5">{t('settings.content.mutedContent')} <HelpTip faqId="report-content" /></h2>
            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setRecoveryOpen(true)}
              >
                <RotateCcw className="size-3.5" />
                {t('settings.content.recovery')}
              </Button>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pb-4">
            <MuteSettingsInternals />
          </div>
        </div>

        {user && (
          <MuteListRecoveryDialog
            open={recoveryOpen}
            onOpenChange={setRecoveryOpen}
          />
        )}

        {/* Sensitive Content Section */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">{t('settings.content.sensitiveContent')} <HelpTip faqId="report-content" /></h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pb-4">
            <SensitiveContentSection />
          </div>
        </div>

        {/* Viewing Preferences Section */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold">{t('settings.content.viewingPreferences')}</h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="px-3 py-4 space-y-5">
            <VideoAutoplaySection />
            <ThemePreferencesSection />
          </div>
        </div>

      </div>
    </main>
  );
}
