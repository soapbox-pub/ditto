import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function AdvancedSettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const [systemOpen, setSystemOpen] = useState(true);
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState(config.linkPreviewUrl);
  const [corsProxy, setCorsProxy] = useState(config.corsProxy);

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
                  className="font-mono text-sm"
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
                  className="font-mono text-sm"
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
                  className="font-mono text-sm"
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
                  placeholder="https://proxy.shakespeare.diy/?url={href}"
                  className="font-mono text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://proxy.shakespeare.diy/?url={'{href}'}</span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
