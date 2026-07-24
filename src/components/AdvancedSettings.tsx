import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Bug, RotateCcw, AlertTriangle, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { RequestToVanishDialog } from '@/components/RequestToVanishDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { CurrencyDisplay } from '@/contexts/AppContext';

/** The build-time default DSN from the environment variable. */
const DEFAULT_SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function AdvancedSettings() {
  const { t } = useTranslation();
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const [systemOpen, setSystemOpen] = useState(true);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [sentryOpen, setSentryOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [vanishDialogOpen, setVanishDialogOpen] = useState(false);
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState(config.linkPreviewUrl);
  const [corsProxy, setCorsProxy] = useState(config.corsProxy);
  const [sentryDsn, setSentryDsn] = useState(config.sentryDsn);

  const handleStatsPubkeyChange = (value: string) => {
    setStatsPubkey(value);
    if (value.length === 64 && /^[0-9a-f]{64}$/i.test(value)) {
      updateConfig(() => ({ nip85StatsPubkey: value.toLowerCase() }));
      toast({ title: t('settings.advanced.statsSourceUpdated'), description: t('settings.advanced.statsSourceUpdatedDescription') });
    } else if (value.length === 0) {
      updateConfig(() => ({ nip85StatsPubkey: '' }));
      toast({ title: t('settings.advanced.statsSourceCleared') });
    }
  };

  const currencyDisplay: CurrencyDisplay = config.currencyDisplay ?? 'usd';

  const handleCurrencyChange = async (value: string) => {
    if (value !== 'usd' && value !== 'sats') return;
    updateConfig(() => ({ currencyDisplay: value }));
    if (user) await updateSettings.mutateAsync({ currencyDisplay: value });
    toast({
      title: t('settings.advanced.currencyUpdated'),
      description: value === 'usd' ? t('settings.advanced.currencyUpdatedUsd') : t('settings.advanced.currencyUpdatedSats'),
    });
  };

  return (
    <div>
      {/* System Section (includes Stats Source) */}
      <div>
        <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">{t('settings.advanced.system')}</span>
              {systemOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5">

              {/* Stats Source */}
              <div>
                <Label htmlFor="stats-pubkey" className="text-sm font-medium">
                  {t('settings.advanced.statsPubkeyLabel')}
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  {t('settings.advanced.statsPubkeyDescription')}
                </p>
                <Input
                  id="stats-pubkey"
                  value={statsPubkey}
                  onChange={(e) => handleStatsPubkeyChange(e.target.value)}
                  placeholder={t('settings.advanced.statsPubkeyPlaceholder')}
                  className="font-mono text-base md:text-sm"
                  maxLength={64}
                />
                {statsPubkey && statsPubkey.length !== 64 && (
                  <p className="text-xs text-destructive mt-1">
                    {t('settings.advanced.statsPubkeyError')}
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">{t('settings.advanced.defaultLabel')}{' '}</span>
                  <span className="font-mono break-all">5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea</span>
                </div>
              </div>

              {/* Favicon URL */}
              <div>
                <Label htmlFor="favicon-url" className="text-sm font-medium">
                  {t('settings.advanced.faviconUrlLabel')}
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <Trans
                    i18nKey="settings.advanced.faviconUrlDescription"
                    components={{ code: <code className="bg-muted px-1 rounded" /> }}
                  />
                </p>
                <Input
                  id="favicon-url"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = faviconUrl.trim();
                    if (trimmed && trimmed !== config.faviconUrl) {
                      updateConfig(() => ({ faviconUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ faviconUrl: trimmed });
                      toast({ title: t('settings.advanced.faviconUrlUpdated') });
                    }
                  }}
                  placeholder="https://ditto.pub/api/favicon/{hostname}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">{t('settings.advanced.defaultLabel')}{' '}</span>
                  <span className="font-mono break-all">https://ditto.pub/api/favicon/{'{hostname}'}</span>
                </div>
              </div>

              {/* Link Preview URL */}
              <div>
                <Label htmlFor="link-preview-url" className="text-sm font-medium">
                  {t('settings.advanced.linkPreviewUrlLabel')}
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <Trans
                    i18nKey="settings.advanced.linkPreviewUrlDescription"
                    components={{ code: <code className="bg-muted px-1 rounded" /> }}
                  />
                </p>
                <Input
                  id="link-preview-url"
                  value={linkPreviewUrl}
                  onChange={(e) => setLinkPreviewUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = linkPreviewUrl.trim();
                    if (trimmed && trimmed !== config.linkPreviewUrl) {
                      updateConfig(() => ({ linkPreviewUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ linkPreviewUrl: trimmed });
                      toast({ title: t('settings.advanced.linkPreviewUrlUpdated') });
                    }
                  }}
                  placeholder="https://ditto.pub/api/link-preview/{url}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">{t('settings.advanced.defaultLabel')}{' '}</span>
                  <span className="font-mono break-all">https://ditto.pub/api/link-preview/{'{url}'}</span>
                </div>
              </div>

              {/* CORS Proxy */}
              <div>
                <Label htmlFor="cors-proxy" className="text-sm font-medium">
                  {t('settings.advanced.corsProxyLabel')}
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <Trans
                    i18nKey="settings.advanced.corsProxyDescription"
                    components={{ code: <code className="bg-muted px-1 rounded" /> }}
                  />
                </p>
                <Input
                  id="cors-proxy"
                  value={corsProxy}
                  onChange={(e) => setCorsProxy(e.target.value)}
                  onBlur={async () => {
                    const trimmed = corsProxy.trim();
                    if (trimmed && trimmed !== config.corsProxy) {
                      updateConfig(() => ({ corsProxy: trimmed }));
                      if (user) await updateSettings.mutateAsync({ corsProxy: trimmed });
                      toast({ title: t('settings.advanced.corsProxyUpdated') });
                    }
                  }}
                  placeholder="https://proxy.shakespeare.diy/?url={href}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">{t('settings.advanced.defaultLabel')}{' '}</span>
                  <span className="font-mono break-all">https://proxy.shakespeare.diy/?url={'{href}'}</span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Currency Section */}
      <div>
        <Collapsible open={currencyOpen} onOpenChange={setCurrencyOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Coins className="h-4 w-4" />
                {t('settings.advanced.currency')}
              </span>
              {currencyOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-3">
              <div>
                <Label className="text-sm font-medium">{t('settings.advanced.currencyDisplayLabel')}</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  {t('settings.advanced.currencyDisplayDescription')}
                </p>
                <RadioGroup
                  value={currencyDisplay}
                  onValueChange={handleCurrencyChange}
                  className="gap-2"
                >
                  <label
                    htmlFor="currency-usd"
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <RadioGroupItem value="usd" id="currency-usd" />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{t('settings.advanced.currencyUsd')}</span>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.advanced.currencyExample')} <span className="font-semibold">$2.50</span>
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="currency-sats"
                    className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <RadioGroupItem value="sats" id="currency-sats" />
                    <div className="flex-1">
                      <span className="text-sm font-medium">{t('settings.advanced.currencySats')}</span>
                      <p className="text-xs text-muted-foreground">
                        {t('settings.advanced.currencyExample')} <span className="font-semibold">6,300 sats</span>
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Error Reporting Section */}
      <div>
        <Collapsible open={sentryOpen} onOpenChange={setSentryOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Bug className="h-4 w-4" />
                {t('settings.advanced.errorReporting')}
              </span>
              {sentryOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5">

              {/* Share error reports toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="sentry-enabled" className="text-sm font-medium">
                    {t('settings.advanced.shareErrorReports')}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.advanced.shareErrorReportsDescription')}
                  </p>
                </div>
                <Switch
                  id="sentry-enabled"
                  checked={config.sentryEnabled}
                  onCheckedChange={(checked) => {
                    updateConfig((current) => ({ ...current, sentryEnabled: checked }));
                  }}
                />
              </div>

              {/* Sentry DSN */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="sentry-dsn" className="text-sm font-medium">
                    Sentry DSN
                    {sentryDsn !== DEFAULT_SENTRY_DSN && (
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-yellow-400" title={t('settings.advanced.modifiedFromDefault')} />
                    )}
                  </Label>
                  {sentryDsn !== DEFAULT_SENTRY_DSN && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      title={t('settings.advanced.restoreToDefault')}
                      onClick={async () => {
                        setSentryDsn(DEFAULT_SENTRY_DSN);
                        updateConfig((current) => ({ ...current, sentryDsn: DEFAULT_SENTRY_DSN }));
                        if (user) await updateSettings.mutateAsync({ sentryDsn: DEFAULT_SENTRY_DSN });
                        toast({ title: t('settings.advanced.sentryDsnRestored') });
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  {t('settings.advanced.sentryDsnDescription')}
                </p>
                <Input
                  id="sentry-dsn"
                  value={sentryDsn}
                  onChange={(e) => setSentryDsn(e.target.value)}
                  onBlur={async () => {
                    const trimmed = sentryDsn.trim();
                    if (trimmed !== config.sentryDsn) {
                      updateConfig((current) => ({ ...current, sentryDsn: trimmed }));
                      if (user) await updateSettings.mutateAsync({ sentryDsn: trimmed });
                      toast({ title: trimmed ? t('settings.advanced.sentryDsnUpdated') : t('settings.advanced.sentryDsnCleared') });
                    }
                  }}
                  placeholder="https://examplePublicKey@o0.ingest.sentry.io/0"
                  className="font-mono text-base md:text-sm"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Danger Zone Section — only when logged in */}
      {user && (
        <div>
          <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  {t('settings.advanced.dangerZone')}
                </span>
                {dangerOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-destructive rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pt-3 pb-4 space-y-4">
                <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">{t('settings.deleteAccount')}</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {t('settings.advanced.deleteAccountDescription')}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setVanishDialogOpen(true)}
                  >
                    {t('settings.deleteAccount')}
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <RequestToVanishDialog
            open={vanishDialogOpen}
            onOpenChange={setVanishDialogOpen}
          />
        </div>
      )}
    </div>
  );
}
