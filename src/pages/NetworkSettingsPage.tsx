import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useIntl } from 'react-intl';
import { Navigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { RelayListManager } from '@/components/RelayListManager';
import { BlossomSettings } from '@/components/BlossomSettings';
import { IntroImage } from '@/components/IntroImage';
import { HelpTip } from '@/components/HelpTip';
import { Label } from '@/components/ui/label';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { cn } from '@/lib/utils';

export function NetworkSettingsPage() {
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.sections.network.label', defaultMessage: "Network" })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: "Settings" })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.network.metaDescription', defaultMessage: "Manage relays and file upload servers" }),
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
            <h1 className="text-xl font-bold flex items-center gap-1.5">{intl.formatMessage({ id: 'settings.sections.network.label', defaultMessage: "Network" })} <HelpTip faqId="what-is-nostr" /></h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {intl.formatMessage({ id: 'settings.network.pageDescription', defaultMessage: "Relays are servers that store and distribute content across the Nostr network. Blossom servers handle file uploads." })}
            </p>
          </div>
        }
      />

      <div className="p-4">
        {/* Intro */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-4">
          <IntroImage src="/relay-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">{intl.formatMessage({ id: 'settings.network.networkConnections', defaultMessage: "Network Connections" })}</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              {intl.formatMessage({ id: 'settings.network.networkConnectionsDescription', defaultMessage: "Manage your relay connections. Relays are servers that store and distribute Nostr events across the network." })}
            </p>
          </div>
        </div>

        {/* Relays */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">{intl.formatMessage({ id: 'settings.network.relays', defaultMessage: "Relays" })} <HelpTip faqId="what-are-relays" /></h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-2 pb-4">
            <RelayListManager />
          </div>
        </div>

        {/* Blossom Servers */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold flex items-center gap-1.5">{intl.formatMessage({ id: 'settings.network.blossomServers', defaultMessage: "Blossom Servers" })} <HelpTip faqId="what-are-blossom" /></h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-2 pb-4">
            <BlossomSettings />
          </div>
        </div>

        {/* Image Upload Quality */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold">{intl.formatMessage({ id: 'settings.network.imageUploads', defaultMessage: "Image Uploads" })}</h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-4 pb-4 px-3 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{intl.formatMessage({ id: 'settings.network.uploadQuality', defaultMessage: "Upload quality" })}</Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {intl.formatMessage({ id: 'settings.network.uploadQualityDescription', defaultMessage: "Compressed resizes large images and picks the smallest format. Original uploads images exactly as-is." })}
              </p>
            </div>
            <div className="inline-flex items-center gap-0.5 p-1 bg-muted/50 rounded-lg">
              {(['compressed', 'original'] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => updateConfig((prev) => ({ ...prev, imageQuality: value }))}
                  className={cn(
                    'px-4 py-1.5 text-sm font-medium rounded-md transition-all capitalize',
                    config.imageQuality === value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {intl.formatMessage({ id: `settings.network.imageQuality.${value}`, defaultMessage: value })}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
