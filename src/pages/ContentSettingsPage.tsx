import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useIntl } from 'react-intl';
import { ContentSettings } from '@/components/ContentSettings';
import { PageHeader } from '@/components/PageHeader';
import { HelpTip } from '@/components/HelpTip';
import { useAppContext } from '@/hooks/useAppContext';

export function ContentSettingsPage() {
  const intl = useIntl();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.sections.feed.label', defaultMessage: "Home Feed" })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.sections.feed.description', defaultMessage: "Choose what types of posts appear in your home feed" }),
  });

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-1.5">{intl.formatMessage({ id: 'settings.sections.feed.label', defaultMessage: "Home Feed" })} <HelpTip faqId="fyp" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {intl.formatMessage({ id: 'settings.feed.pageDescription', defaultMessage: "Nostr supports many content types beyond text posts. Customize which appear in your home feed." })}
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
