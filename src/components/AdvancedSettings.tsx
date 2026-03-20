import { useState } from 'react';
import { ChevronDown, ChevronUp, Bug, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { RequestToVanishDialog } from '@/components/RequestToVanishDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** The build-time default DSN from the environment variable. */
const DEFAULT_SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function AdvancedSettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const [systemOpen, setSystemOpen] = useState(true);
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
      toast({ title: 'Stats source updated', description: 'Using NIP-85 stats from this pubkey.' });
    } else if (value.length === 0) {
      updateConfig(() => ({ nip85StatsPubkey: '' }));
      toast({ title: 'Stats source cleared' });
    }
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
              <span className="text-base font-semibold">System</span>
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
                  NIP-85 Stats Pubkey
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Trusted pubkey for pre-computed engagement stats (likes, reposts, comments).
                </p>
                <Input
                  id="stats-pubkey"
                  value={statsPubkey}
                  onChange={(e) => handleStatsPubkeyChange(e.target.value)}
                  placeholder="Enter 64-character hex pubkey"
                  className="font-mono text-base md:text-sm"
                  maxLength={64}
                />
                {statsPubkey && statsPubkey.length !== 64 && (
                  <p className="text-xs text-destructive mt-1">
                    Pubkey must be exactly 64 hexadecimal characters
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea</span>
                </div>
              </div>

              {/* Favicon URL */}
              <div>
                <Label htmlFor="favicon-url" className="text-sm font-medium">
                  Favicon URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  URI template for fetching site favicons. Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{href}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.
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
                      toast({ title: 'Favicon URL updated' });
                    }
                  }}
                  placeholder="https://fetch.ditto.pub/favicon/{hostname}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://fetch.ditto.pub/favicon/{'{hostname}'}</span>
                </div>
              </div>

              {/* Link Preview URL */}
              <div>
                <Label htmlFor="link-preview-url" className="text-sm font-medium">
                  Link Preview URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  URI template for fetching link previews (returns OEmbed JSON). Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{url}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.
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
                      toast({ title: 'Link preview URL updated' });
                    }
                  }}
                  placeholder="https://fetch.ditto.pub/link/{url}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://fetch.ditto.pub/link/{'{url}'}</span>
                </div>
              </div>

              {/* CORS Proxy */}
              <div>
                <Label htmlFor="cors-proxy" className="text-sm font-medium">
                  CORS Proxy
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Proxy for cross-origin requests (NIP-05 fallback). Use <code className="bg-muted px-1 rounded">{'{href}'}</code> as a placeholder for the target URL.
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
                      toast({ title: 'CORS proxy updated' });
                    }
                  }}
                  placeholder="https://ditto.pub/api/proxy/?url={href}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://ditto.pub/api/proxy/?url={'{href}'}</span>
                </div>
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
                Error Reporting
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
                    Share error reports
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Help improve this app by automatically sending crash and error reports.
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
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-yellow-400" title="Modified from default" />
                    )}
                  </Label>
                  {sentryDsn !== DEFAULT_SENTRY_DSN && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      title="Restore to default"
                      onClick={async () => {
                        setSentryDsn(DEFAULT_SENTRY_DSN);
                        updateConfig((current) => ({ ...current, sentryDsn: DEFAULT_SENTRY_DSN }));
                        if (user) await updateSettings.mutateAsync({ sentryDsn: DEFAULT_SENTRY_DSN });
                        toast({ title: 'Sentry DSN restored to default' });
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Sentry Data Source Name (DSN) for error reporting. Leave empty to disable Sentry.
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
                      toast({ title: trimmed ? 'Sentry DSN updated' : 'Sentry DSN cleared' });
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
                  Danger Zone
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
                    <h3 className="text-sm font-medium">Request to Vanish</h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Permanently request all relays to delete your data, including your profile,
                      posts, reactions, and direct messages. This action is irreversible and legally
                      binding in some jurisdictions (NIP-62).
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setVanishDialogOpen(true)}
                  >
                    Request to Vanish
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
