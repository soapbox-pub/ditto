import { useState, useEffect } from 'react';
import { Plus, X, Wifi, Settings } from 'lucide-react';
import { HelpTip } from '@/components/HelpTip';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useToast } from '@/hooks/useToast';
import { APP_RELAYS } from '@/lib/appRelays';
import { cn } from '@/lib/utils';

interface Relay {
  url: string;
  read: boolean;
  write: boolean;
}

export function RelayListManager() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { updateSettings } = useEncryptedSettings();
  const { toast } = useToast();

  const [relays, setRelays] = useState<Relay[]>(config.relayMetadata.relays);
  const [newRelayUrl, setNewRelayUrl] = useState('');

  // Sync local relay state with config when it changes (e.g., from NostrProvider sync)
  useEffect(() => {
    setRelays(config.relayMetadata.relays);
  }, [config.relayMetadata.relays]);

  const normalizeRelayUrl = (url: string): string => {
    url = url.trim();
    try {
      return new URL(url).toString();
    } catch {
      try {
        return new URL(`wss://${url}`).toString();
      } catch {
        return url;
      }
    }
  };

  const isValidRelayUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;

    const normalized = normalizeRelayUrl(trimmed);
    try {
      new URL(normalized);
      return true;
    } catch {
      return false;
    }
  };

  const handleToggleAppRelays = async (enabled: boolean) => {
    // Update local settings immediately
    updateConfig((current) => ({
      ...current,
      useAppRelays: enabled,
    }));
    
    // Sync to encrypted storage if logged in (non-blocking)
    if (user) {
      updateSettings.mutate({ useAppRelays: enabled });
    }
    
    toast({
      title: enabled ? 'App relays enabled' : 'App relays disabled',
      description: enabled
        ? 'App relays will be used alongside your personal relays.'
        : 'Only your personal relays will be used.',
    });
  };

  const handleAddRelay = () => {
    if (!isValidRelayUrl(newRelayUrl)) {
      toast({
        title: 'Invalid relay URL',
        description: 'Please enter a valid relay URL (e.g., wss://relay.example.com)',
        variant: 'destructive',
      });
      return;
    }

    const normalized = normalizeRelayUrl(newRelayUrl);

    if (relays.some(r => r.url === normalized)) {
      toast({
        title: 'Relay already exists',
        description: 'This relay is already in your list.',
        variant: 'destructive',
      });
      return;
    }

    // Check if it's an app relay
    if (APP_RELAYS.relays.some(r => r.url === normalized)) {
      toast({
        title: 'App relay',
        description: 'This is an app default relay. Enable "App Relays" to use it.',
        variant: 'destructive',
      });
      return;
    }

    const newRelays = [...relays, { url: normalized, read: true, write: true }];
    setRelays(newRelays);
    setNewRelayUrl('');

    saveRelays(newRelays);
  };

  const handleRemoveRelay = (url: string) => {
    const newRelays = relays.filter(r => r.url !== url);
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const handleToggleRead = (url: string) => {
    const newRelays = relays.map(r =>
      r.url === url ? { ...r, read: !r.read } : r
    );
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const handleToggleWrite = (url: string) => {
    const newRelays = relays.map(r =>
      r.url === url ? { ...r, write: !r.write } : r
    );
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const saveRelays = (newRelays: Relay[]) => {
    const now = Math.floor(Date.now() / 1000);

    // Update local config
    updateConfig((current) => ({
      ...current,
      relayMetadata: {
        relays: newRelays,
        updatedAt: now,
      },
    }));

    // Publish to Nostr if user is logged in
    if (user) {
      publishNIP65RelayList(newRelays);
    }
  };

  const publishNIP65RelayList = (relayList: Relay[]) => {
    const tags = relayList.map(relay => {
      if (relay.read && relay.write) {
        return ['r', relay.url];
      } else if (relay.read) {
        return ['r', relay.url, 'read'];
      } else if (relay.write) {
        return ['r', relay.url, 'write'];
      }
      // If neither read nor write, don't include (shouldn't happen)
      return null;
    }).filter((tag): tag is string[] => tag !== null);

    publishEvent(
      {
        kind: 10002,
        content: '',
        tags,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Relay list published',
            description: 'Your relay list has been published to Nostr.',
          });
        },
        onError: (error) => {
          console.error('Failed to publish relay list:', error);
          toast({
            title: 'Failed to publish relay list',
            description: 'There was an error publishing your relay list to Nostr.',
            variant: 'destructive',
          });
        },
      }
    );
  };

  const renderRelayUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'wss:') {
        if (parsed.pathname === '/') {
          return parsed.host;
        } else {
          return parsed.host + parsed.pathname;
        }
      } else {
        return parsed.href;
      }
    } catch {
      return url;
    }
  }

  return (
    <div>
      {/* App Relays Section */}
      <div className="pt-4 pb-4">
        <div className="px-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">App Relays</h3>
            <div className="flex items-center gap-2">
              <Label htmlFor="use-app-relays" className="text-xs text-muted-foreground cursor-pointer">
                {config.useAppRelays ? 'Enabled' : 'Disabled'}
              </Label>
              <Switch
                id="use-app-relays"
                checked={config.useAppRelays}
                onCheckedChange={handleToggleAppRelays}
                className="scale-90"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Default relays for reliable connectivity. Used alongside your personal relays when enabled.
          </p>
        </div>
        
        <div className={cn(
          "mt-3 space-y-1 transition-opacity",
          !config.useAppRelays && "opacity-40"
        )}>
          {APP_RELAYS.relays.map((relay) => (
            <div
              key={relay.url}
              className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors"
            >
              <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-mono text-xs flex-1 truncate" title={relay.url}>
                {renderRelayUrl(relay.url)}
              </span>
              <div className="flex items-center gap-1 text-[10px]">
                {relay.read && (
                  <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-600 dark:text-green-400 font-medium">Read</span>
                )}
                {relay.write && (
                  <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium">Write</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Relays Section */}
      <div className="pb-4 pt-4">
        <div className="px-3 space-y-3">
          <h3 className="text-sm font-medium flex items-center gap-1.5">Your Relays <HelpTip faqId="what-are-relays" iconSize="size-3.5" /></h3>
          <p className="text-xs text-muted-foreground">
            Your personal relay list. These are synced to Nostr when logged in.
          </p>
        </div>

        {/* Relay List */}
        <div className="mt-3">
          {relays.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No personal relays configured. Add relays below or enable App Relays above.
            </div>
          ) : (
            <div className="space-y-1">
              {relays.map((relay) => (
                <div
                  key={relay.url}
                  className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors"
                >
                  <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs flex-1 truncate" title={relay.url}>
                    {renderRelayUrl(relay.url)}
                  </span>

                  {/* Settings Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground shrink-0"
                      >
                        <Settings className="h-3.5 w-3.5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40" align="end">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`read-${relay.url}`} className="text-xs cursor-pointer">
                            Read
                          </Label>
                          <Switch
                            id={`read-${relay.url}`}
                            checked={relay.read}
                            onCheckedChange={() => handleToggleRead(relay.url)}
                            className="data-[state=checked]:bg-green-500 scale-75"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`write-${relay.url}`} className="text-xs cursor-pointer">
                            Write
                          </Label>
                          <Switch
                            id={`write-${relay.url}`}
                            checked={relay.write}
                            onCheckedChange={() => handleToggleWrite(relay.url)}
                            className="data-[state=checked]:bg-blue-500 scale-75"
                          />
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Remove Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveRelay(relay.url)}
                    className="size-7 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Relay Form */}
        <div className="px-3 mt-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="new-relay-url" className="sr-only">
                Relay URL
              </Label>
              <Input
                id="new-relay-url"
                placeholder="wss://relay.example.com"
                value={newRelayUrl}
                onChange={(e) => setNewRelayUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAddRelay();
                  }
                }}
                className="h-9 text-sm"
              />
            </div>
            <Button
              onClick={handleAddRelay}
              disabled={!newRelayUrl.trim()}
              variant="outline"
              size="sm"
              className="h-9 shrink-0 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add
            </Button>
          </div>

          {!user && (
            <p className="text-[10px] text-muted-foreground mt-2">
              Log in to sync your relay list with Nostr
            </p>
          )}
        </div>
      </div>
    </div>
  );
}