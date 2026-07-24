import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const [walletOpen, setWalletOpen] = useState(false);

  useSeoMeta({
    title: `${t('settings.advanced.title')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.advanced.metaDescription'),
  });

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{t('settings.advanced.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('settings.advanced.subtitle')}
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Intro */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-4">
          <IntroImage src="/advanced-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{t('settings.advanced.introTitle')}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {t('settings.advanced.introDescription')}
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
                <span className="text-base font-semibold">{t('settings.wallet.title')}</span>
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
