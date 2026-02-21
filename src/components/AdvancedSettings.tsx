import { useState } from 'react';
import { ChevronDown, ChevronUp, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { WalletSettings } from '@/components/WalletSettings';
import { RelayListManager } from '@/components/RelayListManager';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';

export function AdvancedSettings() {
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const [walletOpen, setWalletOpen] = useState(false);
  const [relaysOpen, setRelaysOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);
  const [newBlossomUrl, setNewBlossomUrl] = useState('');
  const [defaultZapComment, setDefaultZapComment] = useState(config.defaultZapComment);
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl);
  const [corsProxy, setCorsProxy] = useState(config.corsProxy);

  const handleAddBlossomServer = () => {
    const trimmed = newBlossomUrl.trim();
    if (!trimmed) return;

    // Normalize URL
    let url: string;
    try {
      url = new URL(trimmed).toString();
    } catch {
      try {
        url = new URL(`https://${trimmed}`).toString();
      } catch {
        toast({ title: 'Invalid URL', variant: 'destructive' });
        return;
      }
    }

    // Check for duplicates
    if (config.blossomServers.includes(url)) {
      toast({ title: 'Server already added', variant: 'destructive' });
      return;
    }

    updateConfig(() => ({ blossomServers: [...config.blossomServers, url] }));
    setNewBlossomUrl('');
    toast({ title: 'Blossom server added' });
  };

  const handleStatsPubkeyChange = (value: string) => {
    setStatsPubkey(value);
    
    // Validate hex format (64 characters)
    if (value.length === 64 && /^[0-9a-f]{64}$/i.test(value)) {
      updateConfig(() => ({ nip85StatsPubkey: value.toLowerCase() }));
      toast({
        title: 'Stats source updated',
        description: 'Using NIP-85 stats from this pubkey.',
      });
    } else if (value.length === 0) {
      // Allow clearing the field - disable NIP-85
      updateConfig(() => ({ nip85StatsPubkey: '' }));
      toast({
        title: 'Stats source cleared',
        description: 'Stats will be calculated manually.',
      });
    }
  };

  return (
    <div>
      {/* Intro */}
      <div className="px-3 pt-2 pb-4">
        <h2 className="text-sm font-semibold">Advanced Settings</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Power user features including wallet connections and network relay management.
        </p>
      </div>

      {/* Wallet Section — only when logged in */}
      {user && (
        <div>
          <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">Wallet</span>
                {walletOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pb-4 pt-4">
                <div className="px-3">
                  <WalletSettings />
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Network (Relays) Section — only when logged in */}
      {user && (
        <div>
          <Collapsible open={relaysOpen} onOpenChange={setRelaysOpen}>
            <CollapsibleTrigger asChild>
              <Button 
                variant="ghost" 
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">Network</span>
                {relaysOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pb-4">
                <RelayListManager />

                {/* Blossom Servers */}
                <div className="pt-4 pb-4">
                  <div className="px-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <h3 className="text-sm font-medium">Blossom Servers</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      File upload servers for media attachments. Files are uploaded to the first available server.
                    </p>
                  </div>

                  {/* Server list */}
                  <div className="mt-3">
                    {config.blossomServers.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-8 text-center">
                        No Blossom servers configured. Add a server below.
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {config.blossomServers.map((server) => (
                          <div
                            key={server}
                            className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors"
                          >
                            <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-mono text-xs flex-1 truncate" title={server}>
                              {(() => {
                                try {
                                  const parsed = new URL(server);
                                  return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
                                } catch {
                                  return server;
                                }
                              })()}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                const updated = config.blossomServers.filter((s) => s !== server);
                                updateConfig(() => ({ blossomServers: updated }));
                                toast({ title: 'Blossom server removed' });
                              }}
                              className="size-7 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add server form */}
                  <div className="px-3 mt-3">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <Label htmlFor="new-blossom-url" className="sr-only">
                          Blossom Server URL
                        </Label>
                        <Input
                          id="new-blossom-url"
                          value={newBlossomUrl}
                          onChange={(e) => setNewBlossomUrl(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleAddBlossomServer();
                            }
                          }}
                          placeholder="https://blossom.example.com/"
                          className="h-9 text-sm font-mono"
                        />
                      </div>
                      <Button
                        onClick={handleAddBlossomServer}
                        disabled={!newBlossomUrl.trim()}
                        variant="outline"
                        size="sm"
                        className="h-9 shrink-0 text-xs"
                      >
                        <Upload className="h-3.5 w-3.5 mr-1.5" />
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* Stats Source Section */}
      <div>
        <Collapsible open={statsOpen} onOpenChange={setStatsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Stats Source</span>
              {statsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              <div className="px-3 pt-3 pb-4 space-y-3">
                <div>
                  <Label htmlFor="stats-pubkey" className="text-sm font-medium">
                    NIP-85 Stats Pubkey
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1 mb-2">
                    Enter a trusted pubkey for pre-computed engagement stats (likes, reposts, comments). 
                    Leave empty to always calculate stats manually.
                  </p>
                  <Input
                    id="stats-pubkey"
                    value={statsPubkey}
                    onChange={(e) => handleStatsPubkeyChange(e.target.value)}
                    placeholder="Enter 64-character hex pubkey or leave empty"
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
              </div>

              <div className="flex items-center justify-between py-2.5 px-3 border-t border-border">
                <div className="min-w-0">
                  <span className="text-sm">NIP-85 Only Mode</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Disable manual stat calculation. Stats will only show if NIP-85 pubkey provides them.
                  </p>
                </div>
                <Switch
                  id="nip85-only-mode"
                  checked={config.nip85OnlyMode}
                  onCheckedChange={(checked) => {
                    updateConfig(() => ({ nip85OnlyMode: checked }));
                    toast({
                      title: checked ? 'NIP-85 only mode enabled' : 'NIP-85 only mode disabled',
                      description: checked 
                        ? 'Manual stat calculation is disabled.' 
                        : 'Manual stat calculation will be used as fallback.',
                    });
                  }}
                  disabled={!statsPubkey}
                  className="scale-90"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* System Section */}
      <div>
        <Collapsible open={servicesOpen} onOpenChange={setServicesOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">System</span>
              {servicesOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5">
              {/* Default Zap Comment */}
              <div>
                <Label htmlFor="default-zap-comment" className="text-sm font-medium">
                  Default Zap Comment
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Pre-filled comment when sending zaps.
                </p>
                <Input
                  id="default-zap-comment"
                  value={defaultZapComment}
                  onChange={(e) => {
                    setDefaultZapComment(e.target.value);
                  }}
                  onBlur={() => {
                    if (defaultZapComment !== config.defaultZapComment) {
                      updateConfig(() => ({ defaultZapComment }));
                      toast({ title: 'Default zap comment updated' });
                    }
                  }}
                  placeholder="Zapped with Mew!"
                  className="text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span>Zapped with Mew!</span>
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
                  onChange={(e) => {
                    setFaviconUrl(e.target.value);
                  }}
                  onBlur={() => {
                    const trimmed = faviconUrl.trim();
                    if (trimmed && trimmed !== config.faviconUrl) {
                      updateConfig(() => ({ faviconUrl: trimmed }));
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

              {/* CORS Proxy */}
              <div>
                <Label htmlFor="cors-proxy" className="text-sm font-medium">
                  CORS Proxy
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Proxy for cross-origin requests (link previews, NIP-05 fallback). Use <code className="bg-muted px-1 rounded">{'{href}'}</code> as a placeholder for the target URL.
                </p>
                <Input
                  id="cors-proxy"
                  value={corsProxy}
                  onChange={(e) => {
                    setCorsProxy(e.target.value);
                  }}
                  onBlur={() => {
                    const trimmed = corsProxy.trim();
                    if (trimmed && trimmed !== config.corsProxy) {
                      updateConfig(() => ({ corsProxy: trimmed }));
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
