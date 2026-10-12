import { useSeoMeta } from '@/hooks/useSeoMeta';
import { HelpCircle, Shield } from 'lucide-react';
import { Link } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';

import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { PageHeader } from '@/components/PageHeader';
import { TeamSoapboxCard } from '@/components/TeamSoapboxCard';
import { HelpFAQSection } from '@/components/HelpFAQSection';

export function HelpPage() {
  const { config } = useAppContext();
  const intl = useIntl();
  useLayoutOptions({});

  useSeoMeta({
    title: intl.formatMessage({ id: 'help.seoTitle', defaultMessage: 'Help | {appName}' }, { appName: config.appName }),
    description: intl.formatMessage(
      { id: 'help.metaDescription', defaultMessage: 'Get help with {appName}: Nostr 101, FAQs, and support' },
      { appName: config.appName },
    ),
  });

  return (
    <main className="min-h-screen">
      <PageHeader title={intl.formatMessage({ id: 'help.title', defaultMessage: 'Help' })} icon={<HelpCircle className="size-5" />} />

      {/* Team Soapbox follow pack */}
      <TeamSoapboxCard className="px-4 pt-2 pb-4" />

      {/* FAQ heading */}
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-lg font-bold">
          <FormattedMessage id="help.faqTitle" defaultMessage="Frequently Asked Questions" />
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          <FormattedMessage
            id="help.faqDescription"
            defaultMessage="Everything you need to know about Nostr, {appName}, and how it all works."
            values={{ appName: config.appName }}
          />
        </p>
      </div>

      {/* FAQ accordion sections */}
      <HelpFAQSection className="px-4 pb-8" />

      {/* Privacy policy link */}
      <div className="px-4 pb-8">
        <Link
          to="/privacy"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Shield className="size-4" />
          <span><FormattedMessage id="help.privacyPolicy" defaultMessage="Privacy Policy" /></span>
        </Link>
      </div>
    </main>
  );
}
