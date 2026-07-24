import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useTranslation } from 'react-i18next';
import { ContentSettings } from '@/components/ContentSettings';
import { PageHeader } from '@/components/PageHeader';
import { HelpTip } from '@/components/HelpTip';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentSettingsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('settings.sections.feed.label')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.sections.feed.description'),
  });

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-1.5">{t('settings.sections.feed.label')} <HelpTip faqId="fyp" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('settings.feed.pageDescription')}
            </p>
          </div>
        }
      />

      <div className="p-4">
        <ContentSettings />
      </div>
    </main>
  );
}
