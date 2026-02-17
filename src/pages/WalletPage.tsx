import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Wallet, Plus, Trash2, Zap, Globe, WalletMinimal, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNWC } from '@/hooks/useNWCContext';
import { useWallet } from '@/hooks/useWallet';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function WalletPage() {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [connectionUri, setConnectionUri] = useState('');
  const [alias, setAlias] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const { user } = useCurrentUser();
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

  useSeoMeta({
    title: 'Wallet | Mew',
    description: 'Manage your Lightning wallet connections',
  });

  const handleAddConnection = async () => {
    if (!connectionUri.trim()) {
      toast({
        title: 'Connection URI required',
        description: 'Please enter a valid NWC connection URI.',
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
      title: 'Active wallet changed',
      description: 'The selected wallet is now active for zaps.',
    });
  };

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        {/* Sticky header */}
        <div className="flex items-center gap-4 px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Wallet className="size-5" />
            <h1 className="text-xl font-bold">Wallet</h1>
          </div>
        </div>

        {!user ? (
          <div className="py-20 text-center px-6">
            <Wallet className="size-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground text-lg mb-1">Log in to manage your wallet</p>
            <p className="text-sm text-muted-foreground">Connect a Lightning wallet to send zaps on Nostr.</p>
          </div>
        ) : (
          <div className="px-4 py-6 space-y-6">
            {/* Connection status cards */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide px-1">Status</h2>
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
                        <p className="text-xs text-muted-foreground">Browser extension</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {webln && <CheckCircle className="size-4 text-green-500" />}
                      <Badge variant={webln ? 'default' : 'secondary'} className="text-xs">
                        {webln ? 'Ready' : 'Not Found'}
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
                            ? `${connections.length} wallet${connections.length !== 1 ? 's' : ''} connected`
                            : 'Remote wallet connection'}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {hasNWC && <CheckCircle className="size-4 text-green-500" />}
                      <Badge variant={hasNWC ? 'default' : 'secondary'} className="text-xs">
                        {hasNWC ? 'Ready' : 'None'}
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
                  Add
                </Button>
              </div>

              {connections.length === 0 ? (
                <Card className="border-dashed">
                  <CardContent className="py-10 text-center">
                    <WalletMinimal className="size-8 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground mb-1">No wallets connected</p>
                    <p className="text-xs text-muted-foreground/70">Add an NWC connection to enable instant zaps.</p>
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
                                {connection.alias || info?.alias || 'Lightning Wallet'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {isActive ? 'Active' : 'NWC Connection'}
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
                                title="Set as active"
                              >
                                <Zap className="size-3.5" />
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveConnection(connection.connectionString)}
                              className="rounded-full text-muted-foreground hover:text-destructive"
                              title="Remove wallet"
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
                    Install a WebLN browser extension or connect a NWC wallet to send zaps.
                  </p>
                </div>
              </>
            )}
          </div>
        )}
      </main>

      {/* Add wallet dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Connect NWC Wallet</DialogTitle>
            <DialogDescription>
              Enter your connection string from a compatible wallet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-4">
            <div>
              <Label htmlFor="wallet-alias">Wallet Name (optional)</Label>
              <Input
                id="wallet-alias"
                placeholder="My Lightning Wallet"
                value={alias}
                onChange={(e) => setAlias(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="wallet-connection-uri">Connection URI</Label>
              <Textarea
                id="wallet-connection-uri"
                placeholder="nostr+walletconnect://..."
                value={connectionUri}
                onChange={(e) => setConnectionUri(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="px-4">
            <Button
              onClick={handleAddConnection}
              disabled={isConnecting || !connectionUri.trim()}
              className="w-full"
            >
              {isConnecting ? 'Connecting...' : 'Connect'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
