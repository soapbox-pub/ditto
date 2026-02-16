import { useState } from 'react';
import { RefreshCw, Database, Wifi, CheckCircle2, Loader2 } from 'lucide-react';
import { useDMContext } from '@/hooks/useDMContext';
import { LOADING_PHASES } from '@/lib/dmConstants';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/useToast';

interface DMStatusInfoProps {
  clearCacheAndRefetch?: () => Promise<void>;
}

export const DMStatusInfo = ({ clearCacheAndRefetch }: DMStatusInfoProps) => {
  const [isClearing, setIsClearing] = useState(false);
  const { toast } = useToast();
  const {
    loadingPhase,
    subscriptions,
    scanProgress,
    isDoingInitialLoad,
    lastSync,
    conversations,
  } = useDMContext();

  const handleClearCache = async () => {
    if (!clearCacheAndRefetch) return;
    
    setIsClearing(true);
    try {
      await clearCacheAndRefetch();
      toast({
        title: 'Cache cleared',
        description: 'Refetching messages from relays...',
      });
      setIsClearing(false);
    } catch (error) {
      console.error('Error clearing cache:', error);
      toast({
        title: 'Error',
        description: 'Failed to clear cache. Please try again.',
        variant: 'destructive',
      });
      setIsClearing(false);
    }
  };

  const getLoadingPhaseInfo = () => {
    switch (loadingPhase) {
      case LOADING_PHASES.IDLE:
        return { label: 'Idle', description: 'Not yet initialized', icon: Loader2, color: 'text-muted-foreground' };
      case LOADING_PHASES.CACHE:
        return { label: 'Loading from cache', description: 'Reading cached messages...', icon: Database, color: 'text-blue-500' };
      case LOADING_PHASES.RELAYS:
        return { label: 'Loading from relays', description: 'Fetching messages from Nostr relays...', icon: Wifi, color: 'text-yellow-500' };
      case LOADING_PHASES.SUBSCRIPTIONS:
        return { label: 'Connecting subscriptions', description: 'Setting up real-time message sync...', icon: RefreshCw, color: 'text-orange-500' };
      case LOADING_PHASES.READY:
        return { label: 'Ready', description: 'All systems operational', icon: CheckCircle2, color: 'text-green-500' };
      default:
        return { label: 'Unknown', description: 'Status unknown', icon: Loader2, color: 'text-muted-foreground' };
    }
  };

  const phaseInfo = getLoadingPhaseInfo();
  const PhaseIcon = phaseInfo.icon;

  const formatTimestamp = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      {/* Loading Phase */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <PhaseIcon className={`h-5 w-5 ${phaseInfo.color} ${loadingPhase !== LOADING_PHASES.READY ? 'animate-pulse' : ''}`} />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <p className="font-medium">{phaseInfo.label}</p>
                {isDoingInitialLoad && (
                  <Badge variant="secondary" className="text-xs">
                    Initial Load
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{phaseInfo.description}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scan Progress */}
      {(scanProgress.nip4 !== null || scanProgress.nip17 !== null) && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-3">
              <p className="text-sm font-medium">Scanning Messages</p>
              {scanProgress.nip4 !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">NIP-4 (Legacy)</span>
                    <span className="text-muted-foreground">{scanProgress.nip4.current} events</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{scanProgress.nip4.status}</p>
                </div>
              )}
              {scanProgress.nip17 !== null && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">NIP-17 (Private)</span>
                    <span className="text-muted-foreground">{scanProgress.nip17.current} events</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{scanProgress.nip17.status}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Subscriptions */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Real-time Subscriptions</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">NIP-4 (Legacy DMs)</span>
                <Badge variant={subscriptions.isNIP4Connected ? 'default' : 'secondary'}>
                  {subscriptions.isNIP4Connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">NIP-17 (Private DMs)</span>
                <Badge variant={subscriptions.isNIP17Connected ? 'default' : 'secondary'}>
                  {subscriptions.isNIP17Connected ? 'Connected' : 'Disconnected'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cache Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <p className="text-sm font-medium">Cache Information</p>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Conversations</span>
                <span className="font-medium">{conversations.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last NIP-4 sync</span>
                <span className="font-medium">{formatTimestamp(lastSync.nip4)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last NIP-17 sync</span>
                <span className="font-medium">{formatTimestamp(lastSync.nip17)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      {clearCacheAndRefetch && (
        <>
          <Separator />
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">Cache Management</p>
              <p className="text-xs text-muted-foreground">
                Clear all cached messages and refetch from relays. This will force a fresh sync.
              </p>
            </div>
            <Button
              onClick={handleClearCache}
              disabled={isClearing}
              variant="outline"
              className="w-full"
            >
              {isClearing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Clearing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Clear Cache & Refetch
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

