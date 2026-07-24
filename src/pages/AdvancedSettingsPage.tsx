import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useIntl } from 'react-intl';
import { PageHeader } from '@/components/PageHeader';
import { IntroImage } from '@/components/IntroImage';
import { AdvancedSettings } from '@/components/AdvancedSettings';
import { WalletSettings } from '@/components/WalletSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';

export function AdvancedSettingsPage() {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const [walletOpen, setWalletOpen] = useState(false);

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.advanced.title', defaultMessage: "Advanced" })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.advanced.metaDescription', defaultMessage: "Advanced settings for wallet, system, and power user configuration" }),
  });

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{intl.formatMessage({ id: 'settings.advanced.title', defaultMessage: "Advanced" })}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {intl.formatMessage({ id: 'settings.advanced.subtitle', defaultMessage: "Wallet connections, system configuration, and other advanced options for power users." })}
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Intro */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-4">
          <IntroImage src="/advanced-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{intl.formatMessage({ id: 'settings.advanced.introTitle', defaultMessage: "Power User Settings" })}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {intl.formatMessage({ id: 'settings.advanced.introDescription', defaultMessage: "Wallet connections, system configuration, and other advanced options." })}
            </p>
          </div>
        </div>

        {/* Wallet collapsible — only when logged in */}
        {user && (
          <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">{intl.formatMessage({ id: 'settings.wallet.title', defaultMessage: "Wallet" })}</span>
                {walletOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pt-2 pb-4">
                <WalletSettings />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        <AdvancedSettings />
      </div>
    </main>
  );
}
