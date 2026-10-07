import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import type { ReactNode } from 'react';

import { ThemePreferencesSection } from '@/components/ContentSettings';
import { IntroImage } from '@/components/IntroImage';
import { PageHeader } from '@/components/PageHeader';
import { QuickReactionsSection } from '@/components/QuickReactionsSection';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSeoMeta } from '@/hooks/useSeoMeta';

export function PersonalizePage() {
  const intl = useIntl();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.sections.personalize.label', defaultMessage: 'Personalize' })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: 'Settings' })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.sections.personalize.description', defaultMessage: 'Your theme, quick reactions, and custom emojis' }),
  });

  return (
    <main className="">
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold"><FormattedMessage id="settings.sections.personalize.label" defaultMessage="Personalize" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <FormattedMessage id="settings.personalize.pageDescription" defaultMessage="Make the app look and feel like yours." />
            </p>
          </div>
        }
      />

      <div className="flex items-center gap-4 px-7 py-2">
        <IntroImage src="/theme-intro.png" size="w-28" />
        <div className="min-w-0">
          <h2 className="text-base font-semibold"><FormattedMessage id="settings.personalize.intro" defaultMessage="Make it yours" /></h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            <FormattedMessage id="settings.personalize.introDescription" defaultMessage="Pick a look, and the emojis you reach for most." />
          </p>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-0">
        <Section title={<FormattedMessage id="settings.personalize.theme" defaultMessage="Theme" />}>
          <LinkRow
            to="/themes"
            label={<FormattedMessage id="settings.personalize.themes" defaultMessage="Themes" />}
            description={<FormattedMessage id="settings.personalize.themesDescription" defaultMessage="Choose a theme, build your own, or browse ones others have shared" />}
          />
          <ThemePreferencesSection />
        </Section>

        {user && (
          <Section title={<FormattedMessage id="settings.personalize.reactions" defaultMessage="Reactions" />}>
            <QuickReactionsSection />
            <LinkRow
              to="/emojis"
              label={<FormattedMessage id="settings.personalize.emojiPacks" defaultMessage="Custom emojis" />}
              description={<FormattedMessage id="settings.personalize.emojiPacksDescription" defaultMessage="Manage the emoji packs you can react and post with" />}
            />
          </Section>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="relative px-3 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
      </div>
      <div className="px-3 py-4 space-y-5">
        {children}
      </div>
    </div>
  );
}

function LinkRow({ to, label, description }: { to: string; label: ReactNode; description: ReactNode }) {
  return (
    <Link
      to={to}
      className="-mx-3 flex items-center justify-between gap-4 rounded-xl px-3 py-2 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
    >
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-primary/40 transition-colors group-hover:text-primary/70" strokeWidth={4} />
    </Link>
  );
}
