import { useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { ChevronDown, ChevronUp, AlertTriangle, Braces, Coins, Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RawEventEditLauncher } from '@/components/RawEventEditDialog';
import { RawEventPublisher } from '@/components/RawEventPublisher';
import { RequestToVanishDialog } from '@/components/RequestToVanishDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLanguage } from '@/hooks/useLanguage';
import { LANGUAGE_OPTIONS } from '@/i18n/language';
import type { CurrencyDisplay } from '@/contexts/AppContext';
import { DEFAULT_FAVICON_URL, DEFAULT_LINK_PREVIEW_URL } from '@/lib/apiUrls';

export function AdvancedSettings() {
  const intl = useIntl();
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const { locale, system, setLanguage } = useLanguage();
  const [systemOpen, setSystemOpen] = useState(true);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [rawEventOpen, setRawEventOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [vanishDialogOpen, setVanishDialogOpen] = useState(false);
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState(config.linkPreviewUrl);
  const [corsProxy, setCorsProxy] = useState(config.corsProxy);

  const handleStatsPubkeyChange = (value: string) => {
    setStatsPubkey(value);
    if (value.length === 64 && /^[0-9a-f]{64}$/i.test(value)) {
      updateConfig((current) => ({ ...current, nip85StatsPubkey: value.toLowerCase() }));
      toast({ title: intl.formatMessage({ id: 'settings.advanced.statsSourceUpdated', defaultMessage: "Stats source updated" }), description: intl.formatMessage({ id: 'settings.advanced.statsSourceUpdatedDescription', defaultMessage: "Using NIP-85 stats from this pubkey." }) });
    } else if (value.length === 0) {
      updateConfig((current) => ({ ...current, nip85StatsPubkey: '' }));
      toast({ title: intl.formatMessage({ id: 'settings.advanced.statsSourceCleared', defaultMessage: "Stats source cleared" }) });
    }
  };

  const currencyDisplay: CurrencyDisplay = config.currencyDisplay ?? 'usd';

  const handleCurrencyChange = async (value: string) => {
    if (value !== 'usd' && value !== 'sats') return;
    updateConfig((current) => ({ ...current, currencyDisplay: value }));
    if (user) await updateSettings.mutateAsync({ currencyDisplay: value });
    toast({
      title: intl.formatMessage({ id: 'settings.advanced.currencyUpdated', defaultMessage: "Currency display updated" }),
      description: value === 'usd' ? intl.formatMessage({ id: 'settings.advanced.currencyUpdatedUsd', defaultMessage: "Amounts shown in US dollars." }) : intl.formatMessage({ id: 'settings.advanced.currencyUpdatedSats', defaultMessage: "Amounts shown in satoshis." }),
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
              className="relative w-full justify-between px-3 py-3.5 h-auto can-hover:bg-muted/20 can-hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold"><FormattedMessage id="settings.advanced.system" defaultMessage={"System"} /></span>
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
                  <FormattedMessage id="settings.advanced.statsPubkeyLabel" defaultMessage={"NIP-85 Stats Pubkey"} />
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <FormattedMessage id="settings.advanced.statsPubkeyDescription" defaultMessage={"Trusted pubkey for pre-computed engagement stats (likes, reposts, comments)."} />
                </p>
                <Input
                  id="stats-pubkey"
                  value={statsPubkey}
                  onChange={(e) => handleStatsPubkeyChange(e.target.value)}
                  placeholder={intl.formatMessage({ id: 'settings.advanced.statsPubkeyPlaceholder', defaultMessage: "Enter 64-character hex pubkey" })}
                  className="font-mono text-base md:text-sm"
                  maxLength={64}
                />
                {statsPubkey && statsPubkey.length !== 64 && (
                  <p className="text-xs text-destructive mt-1">
                    <FormattedMessage id="settings.advanced.statsPubkeyError" defaultMessage={"Pubkey must be exactly 64 hexadecimal characters"} />
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium"><FormattedMessage id="settings.advanced.defaultLabel" defaultMessage={"Default:"} />{' '}</span>
                  <span className="font-mono break-all">5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea</span>
                </div>
              </div>

              {/* Favicon URL */}
              <div>
                <Label htmlFor="favicon-url" className="text-sm font-medium">
                  <FormattedMessage id="settings.advanced.faviconUrlLabel" defaultMessage={"Favicon URL"} />
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <FormattedMessage
                    id="settings.advanced.faviconUrlDescription"
                    defaultMessage="URI template for fetching site favicons. Supports RFC 6570 variables: <code>'{href}'</code>, <code>'{hostname}'</code>, <code>'{origin}'</code>, etc."
                    values={{ code: (chunks) => <code className="bg-muted px-1 rounded">{chunks}</code> }}
                  />
                </p>
                <Input
                  id="favicon-url"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = faviconUrl.trim();
                    if (trimmed && trimmed !== config.faviconUrl) {
                      updateConfig((current) => ({ ...current, faviconUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ faviconUrl: trimmed });
                      toast({ title: intl.formatMessage({ id: 'settings.advanced.faviconUrlUpdated', defaultMessage: "Favicon URL updated" }) });
                    }
                  }}
                  placeholder={DEFAULT_FAVICON_URL}
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium"><FormattedMessage id="settings.advanced.defaultLabel" defaultMessage={"Default:"} />{' '}</span>
                  <span className="font-mono break-all">{DEFAULT_FAVICON_URL}</span>
                </div>
              </div>

              {/* Link Preview URL */}
              <div>
                <Label htmlFor="link-preview-url" className="text-sm font-medium">
                  <FormattedMessage id="settings.advanced.linkPreviewUrlLabel" defaultMessage={"Link Preview URL"} />
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <FormattedMessage
                    id="settings.advanced.linkPreviewUrlDescription"
                    defaultMessage="URI template for fetching link previews (returns OEmbed JSON). Supports RFC 6570 variables: <code>'{url}'</code>, <code>'{hostname}'</code>, <code>'{origin}'</code>, etc."
                    values={{ code: (chunks) => <code className="bg-muted px-1 rounded">{chunks}</code> }}
                  />
                </p>
                <Input
                  id="link-preview-url"
                  value={linkPreviewUrl}
                  onChange={(e) => setLinkPreviewUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = linkPreviewUrl.trim();
                    if (trimmed && trimmed !== config.linkPreviewUrl) {
                      updateConfig((current) => ({ ...current, linkPreviewUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ linkPreviewUrl: trimmed });
                      toast({ title: intl.formatMessage({ id: 'settings.advanced.linkPreviewUrlUpdated', defaultMessage: "Link preview URL updated" }) });
                    }
                  }}
                  placeholder={DEFAULT_LINK_PREVIEW_URL}
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium"><FormattedMessage id="settings.advanced.defaultLabel" defaultMessage={"Default:"} />{' '}</span>
                  <span className="font-mono break-all">{DEFAULT_LINK_PREVIEW_URL}</span>
                </div>
              </div>

              {/* CORS Proxy */}
              <div>
                <Label htmlFor="cors-proxy" className="text-sm font-medium">
                  <FormattedMessage id="settings.advanced.corsProxyLabel" defaultMessage={"CORS Proxy"} />
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <FormattedMessage
                    id="settings.advanced.corsProxyDescription"
                    defaultMessage="Proxy for cross-origin requests (NIP-05 fallback). Use <code>'{href}'</code> as a placeholder for the target URL."
                    values={{ code: (chunks) => <code className="bg-muted px-1 rounded">{chunks}</code> }}
                  />
                </p>
                <Input
                  id="cors-proxy"
                  value={corsProxy}
                  onChange={(e) => setCorsProxy(e.target.value)}
                  onBlur={async () => {
                    const trimmed = corsProxy.trim();
                    if (trimmed && trimmed !== config.corsProxy) {
                      updateConfig((current) => ({ ...current, corsProxy: trimmed }));
                      if (user) await updateSettings.mutateAsync({ corsProxy: trimmed });
                      toast({ title: intl.formatMessage({ id: 'settings.advanced.corsProxyUpdated', defaultMessage: "CORS proxy updated" }) });
                    }
                  }}
                  placeholder="https://proxy.shakespeare.diy/?url={href}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium"><FormattedMessage id="settings.advanced.defaultLabel" defaultMessage={"Default:"} />{' '}</span>
                  <span className="font-mono break-all">https://proxy.shakespeare.diy/?url={'{href}'}</span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Language Section */}
      <div>
        <Collapsible open={languageOpen} onOpenChange={setLanguageOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto can-hover:bg-muted/20 can-hover:text-foreground rounded-none"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Languages className="h-4 w-4" />
                <FormattedMessage id="settings.language.label" defaultMessage={"Language"} />
              </span>
              {languageOpen ? (
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
                <Label htmlFor="ui-language" className="text-sm font-medium">
                  <FormattedMessage id="settings.language.label" defaultMessage={"Language"} />
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  <FormattedMessage id="settings.language.description" defaultMessage={"Choose your preferred interface language"} />
                </p>
                {/* 'system' isn't a supported code, so storing it falls back to
                    the browser/OS locale — see useLanguage. */}
                <Select
                  value={system ? 'system' : locale}
                  onValueChange={setLanguage}
                >
                  <SelectTrigger id="ui-language" className="w-full max-w-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system"><FormattedMessage id="settings.language.system" defaultMessage={"System default"} /></SelectItem>
                    {LANGUAGE_OPTIONS.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code}>
                        {lang.nativeName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              className="relative w-full justify-between px-3 py-3.5 h-auto can-hover:bg-muted/20 can-hover:text-foreground rounded-none"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Coins className="h-4 w-4" />
                <FormattedMessage id="settings.advanced.currency" defaultMessage={"Currency"} />
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
                <Label className="text-sm font-medium"><FormattedMessage id="settings.advanced.currencyDisplayLabel" defaultMessage={"Display amounts in"} /></Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">
                  <FormattedMessage id="settings.advanced.currencyDisplayDescription" defaultMessage={"Choose how zap totals, balances, and other monetary amounts are shown throughout the app. USD is converted from sats using the current BTC price; sats falls back automatically when the price is unavailable."} />
                </p>
                <RadioGroup
                  value={currencyDisplay}
                  onValueChange={handleCurrencyChange}
                  className="gap-2"
                >
                  <label
                    htmlFor="currency-usd"
                    className="flex items-center gap-3 rounded-lg border border-border-subtle px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <RadioGroupItem value="usd" id="currency-usd" />
                    <div className="flex-1">
                      <span className="text-sm font-medium"><FormattedMessage id="settings.advanced.currencyUsd" defaultMessage={"US Dollars"} /></span>
                      <p className="text-xs text-muted-foreground">
                        <FormattedMessage id="settings.advanced.currencyExample" defaultMessage={"e.g."} /> <span className="font-semibold">$2.50</span>
                      </p>
                    </div>
                  </label>
                  <label
                    htmlFor="currency-sats"
                    className="flex items-center gap-3 rounded-lg border border-border-subtle px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                  >
                    <RadioGroupItem value="sats" id="currency-sats" />
                    <div className="flex-1">
                      <span className="text-sm font-medium"><FormattedMessage id="settings.advanced.currencySats" defaultMessage={"Satoshis"} /></span>
                      <p className="text-xs text-muted-foreground">
                        <FormattedMessage id="settings.advanced.currencyExample" defaultMessage={"e.g."} /> <span className="font-semibold"><FormattedMessage id="settings.advanced.currencySatsExample" defaultMessage="6,300 sats" /></span>
                      </p>
                    </div>
                  </label>
                </RadioGroup>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Raw Event Section — only when logged in */}
      {user && (
        <div>
          <Collapsible open={rawEventOpen} onOpenChange={setRawEventOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto can-hover:bg-muted/20 can-hover:text-foreground rounded-none"
              >
                <span className="flex items-center gap-2 text-base font-semibold">
                  <Braces className="h-4 w-4" />
                  <FormattedMessage id="settings.advanced.rawEvent" defaultMessage={"Raw Events"} />
                </span>
                {rawEventOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pt-3 pb-4 space-y-6">
                <RawEventEditLauncher />
                <RawEventPublisher />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Danger Zone Section — only when logged in */}
      {user && (
        <div>
          <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto can-hover:bg-muted/20 can-hover:text-foreground rounded-none"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <FormattedMessage id="settings.advanced.dangerZone" defaultMessage={"Danger Zone"} />
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
                    <h3 className="text-sm font-medium"><FormattedMessage id="settings.deleteAccount" defaultMessage={"Delete Account"} /></h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      <FormattedMessage id="settings.advanced.deleteAccountDescription" defaultMessage={"Permanently delete your data from the network, including your profile, posts, reactions, and direct messages. This action is irreversible."} />
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive can-hover:bg-destructive can-hover:text-destructive-foreground"
                    onClick={() => setVanishDialogOpen(true)}
                  >
                    <FormattedMessage id="settings.deleteAccount" defaultMessage={"Delete Account"} />
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
