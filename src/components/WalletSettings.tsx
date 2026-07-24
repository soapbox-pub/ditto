import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Plus, Trash2, Zap, Globe, WalletMinimal, CheckCircle, X, Bitcoin, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNWC } from '@/hooks/useNWCContext';
import { useWallet } from '@/hooks/useWallet';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { DEFAULT_ESPLORA_APIS } from '@/lib/esplora';

export function WalletSettings() {
  const intl = useIntl();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [connectionUri, setConnectionUri] = useState('');
  const [alias, setAlias] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const {
    connections,
    activeConnection,
    connectionInfo,
    addConnection,
    removeConnection,
    setActiveConnection,
  } = useNWC();
  const { webln } = useWallet();
  const hasNWC = connections.length > 0 && connections.some(c => c.isConnected);
  const { toast } = useToast();

  // ── Esplora APIs (Bitcoin REST endpoints) ─────────────────────
  const { config, updateConfig } = useAppContext();
  const esploraApis = config.esploraApis;
  const [newEsploraUrl, setNewEsploraUrl] = useState('');

  const normalizeEsploraUrl = (url: string): string => {
    const trimmed = url.trim();
    try {
      const parsed = new URL(trimmed);
      // Strip trailing slash so equality checks and the failover client agree.
      return parsed.toString().replace(/\/+$/, '');
    } catch {
      try {
        const parsed = new URL(`https://${trimmed}`);
        return parsed.toString().replace(/\/+$/, '');
      } catch {
        return trimmed;
      }
    }
  };

  const isValidEsploraUrl = (url: string): boolean => {
    const normalized = normalizeEsploraUrl(url);
    try {
      const parsed = new URL(normalized);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const saveEsploraApis = (next: string[]) => {
    updateConfig((current) => ({
      ...current,
      esploraApis: next,
    }));
  };

  const handleAddEsplora = () => {
    if (!isValidEsploraUrl(newEsploraUrl)) {
      toast({
        title: intl.formatMessage({ id: 'settings.wallet.invalidApiUrl', defaultMessage: "Invalid API URL" }),
        description: intl.formatMessage({ id: 'settings.wallet.invalidApiUrlDescription', defaultMessage: "Enter a valid HTTPS URL (e.g. https://mempool.space/api)" }),
        variant: 'destructive',
      });
      return;
    }
    const normalized = normalizeEsploraUrl(newEsploraUrl);
    if (esploraApis.includes(normalized)) {
      toast({ title: intl.formatMessage({ id: 'settings.wallet.alreadyInList', defaultMessage: "Already in the list" }), variant: 'destructive' });
      return;
    }
    saveEsploraApis([...esploraApis, normalized]);
    setNewEsploraUrl('');
  };

  const handleRemoveEsplora = (url: string) => {
    // Zod schema requires at least one URL. Refuse to remove the last entry —
    // the user can hit "Restore defaults" if they want to start over.
    if (esploraApis.length <= 1) {
      toast({
        title: intl.formatMessage({ id: 'settings.wallet.oneApiRequired', defaultMessage: "At least one API is required" }),
        description: intl.formatMessage({ id: 'settings.wallet.oneApiRequiredDescription', defaultMessage: "Add another endpoint before removing this one, or restore the defaults." }),
        variant: 'destructive',
      });
      return;
    }
    saveEsploraApis(esploraApis.filter((u) => u !== url));
  };

  const handleMoveEsplora = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= esploraApis.length) return;
    const next = [...esploraApis];
    [next[index], next[target]] = [next[target], next[index]];
    saveEsploraApis(next);
  };

  const handleResetEsplora = () => {
    saveEsploraApis([...DEFAULT_ESPLORA_APIS]);
    toast({ title: intl.formatMessage({ id: 'settings.wallet.apisRestored', defaultMessage: "Bitcoin APIs restored to defaults" }) });
  };

  const isAtDefaults =
    esploraApis.length === DEFAULT_ESPLORA_APIS.length &&
    esploraApis.every((u, i) => u === DEFAULT_ESPLORA_APIS[i]);

  const renderEsploraUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
    } catch {
      return url;
    }
  };

  const handleAddConnection = async () => {
    if (!connectionUri.trim()) {
      toast({
        title: intl.formatMessage({ id: 'settings.wallet.connectionUriRequired', defaultMessage: "Connection URI required" }),
        description: intl.formatMessage({ id: 'settings.wallet.connectionUriRequiredDescription', defaultMessage: "Please enter a valid NWC connection URI." }),
        variant: 'destructive',
      });
      return;
    }

    setIsConnecting(true);
    try {
      const success = await addConnection(connectionUri.trim(), alias.trim() || undefined);
      if (success) {
        setConnectionUri('');
        setAlias('');
        setAddDialogOpen(false);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleRemoveConnection = (connectionString: string) => {
    removeConnection(connectionString);
  };

  const handleSetActive = (connectionString: string) => {
    setActiveConnection(connectionString);
    toast({
      title: intl.formatMessage({ id: 'settings.wallet.activeWalletChanged', defaultMessage: "Active wallet changed" }),
      description: intl.formatMessage({ id: 'settings.wallet.activeWalletChangedDescription', defaultMessage: "The selected wallet is now active for zaps." }),
    });
  };

  return (
    <>
      <div className="space-y-6">
        {/* Connection status cards */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">{intl.formatMessage({ id: 'settings.wallet.status', defaultMessage: "Status" })}</h2>
          <div className="grid gap-3">
            {/* WebLN */}
            <Card className="overflow-hidden">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-9 rounded-full bg-secondary">
                    <Globe className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">WebLN</p>
                    <p className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'settings.wallet.weblnDescription', defaultMessage: "Browser extension" })}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {webln && <CheckCircle className="size-4 text-green-500" />}
                  <Badge variant={webln ? 'default' : 'secondary'} className="text-xs">
                    {webln ? intl.formatMessage({ id: 'settings.wallet.ready', defaultMessage: "Ready" }) : intl.formatMessage({ id: 'settings.wallet.notFound', defaultMessage: "Not Found" })}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* NWC */}
            <Card className="overflow-hidden">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-9 rounded-full bg-secondary">
                    <WalletMinimal className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Nostr Wallet Connect</p>
                    <p className="text-xs text-muted-foreground">
                      {connections.length > 0
                        ? intl.formatMessage({ id: 'settings.wallet.walletsConnected', defaultMessage: "{count, plural, one {{count} wallet connected} other {{count} wallets connected}}" }, { count: connections.length })
                        : intl.formatMessage({ id: 'settings.wallet.remoteWalletConnection', defaultMessage: "Remote wallet connection" })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasNWC && <CheckCircle className="size-4 text-green-500" />}
                  <Badge variant={hasNWC ? 'default' : 'secondary'} className="text-xs">
                    {hasNWC ? intl.formatMessage({ id: 'settings.wallet.ready', defaultMessage: "Ready" }) : intl.formatMessage({ id: 'settings.wallet.none', defaultMessage: "None" })}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <Separator />

        {/* NWC Wallets */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Nostr Wallet Connect</h2>
            <Button size="sm" variant="outline" onClick={() => setAddDialogOpen(true)} className="rounded-full">
              <Plus className="size-4 mr-1" />
              {intl.formatMessage({ id: 'common.add', defaultMessage: "Add" })}
            </Button>
          </div>

          {connections.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center">
                <WalletMinimal className="size-8 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground mb-1">{intl.formatMessage({ id: 'settings.wallet.noWallets', defaultMessage: "No wallets connected" })}</p>
                <p className="text-xs text-muted-foreground/70">{intl.formatMessage({ id: 'settings.wallet.noWalletsDescription', defaultMessage: "Add an NWC connection to enable instant zaps." })}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {connections.map((connection) => {
                const info = connectionInfo[connection.connectionString];
                const isActive = activeConnection === connection.connectionString;
                return (
                  <Card key={connection.connectionString} className={isActive ? 'ring-2 ring-primary' : ''}>
                    <CardContent className="flex items-center justify-between p-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex items-center justify-center size-9 rounded-full bg-secondary shrink-0">
                          <WalletMinimal className="size-4 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {connection.alias || info?.alias || intl.formatMessage({ id: 'settings.wallet.lightningWallet', defaultMessage: "Lightning Wallet" })}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isActive ? intl.formatMessage({ id: 'settings.wallet.active', defaultMessage: "Active" }) : intl.formatMessage({ id: 'settings.wallet.nwcConnection', defaultMessage: "NWC Connection" })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {isActive && <CheckCircle className="size-4 text-green-500 mr-1" />}
                        {!isActive && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSetActive(connection.connectionString)}
                            className="rounded-full"
                            title={intl.formatMessage({ id: 'settings.wallet.setAsActive', defaultMessage: "Set as active" })}
                          >
                            <Zap className="size-3.5" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveConnection(connection.connectionString)}
                          className="rounded-full text-muted-foreground hover:text-destructive"
                          title={intl.formatMessage({ id: 'settings.wallet.removeWallet', defaultMessage: "Remove wallet" })}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Help text */}
        {!webln && connections.length === 0 && (
          <>
            <Separator />
            <div className="text-center py-4 space-y-2 px-4">
              <p className="text-sm text-muted-foreground">
                {intl.formatMessage({ id: 'settings.wallet.installHelp', defaultMessage: "Install a WebLN browser extension or connect a NWC wallet to send zaps." })}
              </p>
            </div>
          </>
        )}

        <Separator />

        {/* Bitcoin APIs (Esplora failover list) */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              {intl.formatMessage({ id: 'settings.wallet.bitcoinApis', defaultMessage: "Bitcoin APIs" })}
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleResetEsplora}
              disabled={isAtDefaults}
              className="rounded-full text-xs h-7"
              title={intl.formatMessage({ id: 'settings.wallet.restoreDefaultsTitle', defaultMessage: "Restore the default mempool.space → mempool.emzy.de → blockstream.info list" })}
            >
              <RotateCcw className="size-3.5 mr-1" />
              {intl.formatMessage({ id: 'settings.wallet.restoreDefaults', defaultMessage: "Restore defaults" })}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground px-1">
            {intl.formatMessage({ id: 'settings.wallet.bitcoinApisDescription', defaultMessage: "Esplora-compatible Bitcoin REST endpoints used by the wallet, on-chain zaps, and tx/address pages. Tried in order — if the top one is rate-limited or down, the next is tried automatically. Reorder so your preferred endpoint is first." })}
          </p>

          <div className="space-y-2">
            {esploraApis.map((url, index) => (
              <Card key={url}>
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="flex items-center justify-center size-9 rounded-full bg-secondary shrink-0">
                      <Bitcoin className="size-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-mono truncate" title={url}>
                        {renderEsploraUrl(url)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {index === 0 ? intl.formatMessage({ id: 'settings.wallet.primary', defaultMessage: "Primary" }) : intl.formatMessage({ id: 'settings.wallet.fallback', defaultMessage: "Fallback {index}" }, { index })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMoveEsplora(index, -1)}
                      disabled={index === 0}
                      className="rounded-full size-8 p-0"
                      title={intl.formatMessage({ id: 'settings.wallet.moveUp', defaultMessage: "Move up" })}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleMoveEsplora(index, 1)}
                      disabled={index === esploraApis.length - 1}
                      className="rounded-full size-8 p-0"
                      title={intl.formatMessage({ id: 'settings.wallet.moveDown', defaultMessage: "Move down" })}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveEsplora(url)}
                      disabled={esploraApis.length <= 1}
                      className="rounded-full size-8 p-0 text-muted-foreground hover:text-destructive"
                      title={esploraApis.length <= 1 ? intl.formatMessage({ id: 'settings.wallet.oneApiRequired', defaultMessage: "At least one API is required" }) : intl.formatMessage({ id: 'settings.wallet.remove', defaultMessage: "Remove" })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Add new endpoint */}
          <div className="flex gap-2 px-1">
            <div className="flex-1">
              <Label htmlFor="new-esplora-url" className="sr-only">
                {intl.formatMessage({ id: 'settings.wallet.bitcoinApiUrlLabel', defaultMessage: "Bitcoin API URL" })}
              </Label>
              <Input
                id="new-esplora-url"
                value={newEsploraUrl}
                onChange={(e) => setNewEsploraUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddEsplora();
                }}
                placeholder="https://mempool.space/api"
                className="h-9 text-base md:text-sm font-mono"
              />
            </div>
            <Button
              onClick={handleAddEsplora}
              disabled={!newEsploraUrl.trim()}
              variant="outline"
              size="sm"
              className="h-9 shrink-0 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {intl.formatMessage({ id: 'common.add', defaultMessage: "Add" })}
            </Button>
          </div>
        </div>
      </div>

      {/* Add wallet dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-[520px] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 h-12">
            <DialogTitle className="text-base font-semibold">
              {intl.formatMessage({ id: 'settings.wallet.connectDialogTitle', defaultMessage: "Connect NWC Wallet" })}
            </DialogTitle>
            <button
              onClick={() => setAddDialogOpen(false)}
              className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Description */}
          <p className="px-4 -mt-1 mb-2 text-sm text-muted-foreground">
            {intl.formatMessage({ id: 'settings.wallet.connectDialogDescription', defaultMessage: "Paste a connection string from your NWC-compatible wallet." })}
          </p>

          {/* Form fields */}
          <div className="px-4 space-y-4">
            <Input
              placeholder={intl.formatMessage({ id: 'settings.wallet.walletNamePlaceholder', defaultMessage: "Wallet name (optional)" })}
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              className="bg-transparent"
            />
            <Textarea
              placeholder="nostr+walletconnect://..."
              value={connectionUri}
              onChange={(e) => setConnectionUri(e.target.value)}
              rows={3}
              className="bg-transparent resize-none"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-4 py-3">
            <Button
              onClick={handleAddConnection}
              disabled={isConnecting || !connectionUri.trim()}
              className="rounded-full px-5 font-bold"
              size="sm"
            >
              {isConnecting ? intl.formatMessage({ id: 'settings.wallet.connecting', defaultMessage: "Connecting..." }) : intl.formatMessage({ id: 'settings.wallet.connect', defaultMessage: "Connect" })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
