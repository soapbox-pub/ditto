import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useIntl } from 'react-intl';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { HelpTip } from '@/components/HelpTip';
import { WalletSettings } from '@/components/WalletSettings';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function WalletSettingsPage() {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.wallet.title', defaultMessage: "Wallet" })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.wallet.metaDescription', defaultMessage: "Manage your wallet connections" }),
  });

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-1.5">{intl.formatMessage({ id: 'settings.wallet.title', defaultMessage: "Wallet" })} <HelpTip faqId="connect-wallet" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {intl.formatMessage({ id: 'settings.wallet.subtitle', defaultMessage: "Manage wallet connections and payments" })}
            </p>
          </div>
        }
      />

      <div className="p-4">
        <WalletSettings />
      </div>
    </main>
  );
}
