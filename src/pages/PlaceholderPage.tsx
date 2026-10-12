import { FormattedMessage, useIntl } from 'react-intl';

import { useSeoMeta } from '@/hooks/useSeoMeta';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';

interface PlaceholderPageProps {
  title: string;
  icon?: React.ReactNode;
  description?: string;
}

export function PlaceholderPage({ title, icon, description }: PlaceholderPageProps) {
  const { config } = useAppContext();
  const intl = useIntl();

  useSeoMeta({
    title: `${title} | ${config.appName}`,
    description: description || intl.formatMessage({ id: 'placeholderPage.metaDescription', defaultMessage: '{title} page' }, { title }),
  });

  return (
    <main className="">
      <PageHeader title={title} icon={icon} backTo="/" />
      <div className="py-20 text-center">
        <p className="text-muted-foreground text-lg"><FormattedMessage id="placeholderPage.comingSoon" defaultMessage="Coming soon" /></p>
      </div>
    </main>
  );
}
