import { useState, useEffect } from 'react';
import { Upload, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { APP_BLOSSOM_SERVERS } from '@/lib/appBlossom';
import { cn } from '@/lib/utils';

export function BlossomSettings() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [servers, setServers] = useState<string[]>(config.blossomServerMetadata.servers);
  const [newServerUrl, setNewServerUrl] = useState('');

  // Sync local state with config when it changes (e.g., from NostrSync)
  useEffect(() => {
    setServers(config.blossomServerMetadata.servers);
  }, [config.blossomServerMetadata.servers]);

  const normalizeServerUrl = (url: string): string => {
    url = url.trim();
    try {
      return new URL(url).toString();
    } catch {
      try {
        return new URL(`https://${url}`).toString();
      } catch {
        return url;
      }
    }
  };

  const isValidServerUrl = (url: string): boolean => {
    const trimmed = url.trim();
    if (!trimmed) return false;
    const normalized = normalizeServerUrl(trimmed);
    try {
      const parsed = new URL(normalized);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  };

  const handleToggleAppServers = (enabled: boolean) => {
    updateConfig((current) => ({
      ...current,
      useAppBlossomServers: enabled,
    }));
    toast({
      title: enabled ? 'App Blossom servers enabled' : 'App Blossom servers disabled',
      description: enabled
        ? 'App Blossom servers will be used alongside your personal servers.'
        : 'Only your personal Blossom servers will be used.',
    });
  };

  const handleAddServer = () => {
    if (!isValidServerUrl(newServerUrl)) {
      toast({
        title: 'Invalid server URL',
        description: 'Please enter a valid HTTPS URL (e.g., https://blossom.example.com/)',
        variant: 'destructive',
      });
      return;
    }

    const normalized = normalizeServerUrl(newServerUrl);

    if (servers.some((s) => s === normalized)) {
      toast({
        title: 'Server already added',
        variant: 'destructive',
      });
      return;
    }

    const newServers = [...servers, normalized];
    setServers(newServers);
    setNewServerUrl('');
    saveServers(newServers);
  };

  const handleRemoveServer = (url: string) => {
    const newServers = servers.filter((s) => s !== url);
    setServers(newServers);
    saveServers(newServers);
  };

  const saveServers = (newServers: string[]) => {
    const now = Math.floor(Date.now() / 1000);

    updateConfig((current) => ({
      ...current,
      blossomServerMetadata: {
        servers: newServers,
        updatedAt: now,
      },
    }));

    // Publish kind 10063 to Nostr if user is logged in
    if (user) {
      publishKind10063(newServers);
    }
  };

  const publishKind10063 = (serverList: string[]) => {
    const tags = serverList.map((url) => ['server', url]);

    publishEvent(
      {
        kind: 10063,
        content: '',
        tags,
      },
      {
        onSuccess: () => {
          toast({
            title: 'Blossom server list published',
            description: 'Your Blossom server list has been published to Nostr.',
          });
        },
        onError: (error) => {
          console.error('Failed to publish Blossom server list:', error);
          toast({
            title: 'Failed to publish Blossom server list',
            description: 'There was an error publishing your server list to Nostr.',
            variant: 'destructive',
          });
        },
      },
    );
  };

  const renderServerUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.host + (parsed.pathname === '/' ? '' : parsed.pathname);
    } catch {
      return url;
    }
  };

  return (
    <div>
      {/* App Blossom Servers Section */}
      <div className="pt-4 pb-4">
        <div className="px-3 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">App Blossom Servers</h3>
            <div className="flex items-center gap-2">
              <Label
                htmlFor="use-app-blossom-servers"
                className="text-xs text-muted-foreground cursor-pointer"
              >
                {config.useAppBlossomServers ? 'Enabled' : 'Disabled'}
              </Label>
              <Switch
                id="use-app-blossom-servers"
                checked={config.useAppBlossomServers}
                onCheckedChange={handleToggleAppServers}
                className="scale-90"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Default file upload servers for reliable media hosting. Used alongside your personal servers when enabled.
          </p>
        </div>

        <div
          className={cn(
            'mt-3 space-y-1 transition-opacity',
            !config.useAppBlossomServers && 'opacity-40',
          )}
        >
          {APP_BLOSSOM_SERVERS.servers.map((server) => (
            <div
              key={server}
              className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors"
            >
              <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-mono text-xs flex-1 truncate" title={server}>
                {renderServerUrl(server)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* User Blossom Servers Section */}
      <div className="pb-4 pt-4">
        <div className="px-3 space-y-3">
          <h3 className="text-sm font-medium">Your Blossom Servers</h3>
          <p className="text-xs text-muted-foreground">
            Your personal Blossom server list (BUD-03). Synced to Nostr as kind 10063 when logged in.
          </p>
        </div>

        {/* Server List */}
        <div className="mt-3">
          {servers.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No personal Blossom servers configured. Add a server below or enable App Blossom Servers above.
            </div>
          ) : (
            <div className="space-y-1">
              {servers.map((server) => (
                <div
                  key={server}
                  className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors"
                >
                  <Upload className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs flex-1 truncate" title={server}>
                    {renderServerUrl(server)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveServer(server)}
                    className="size-7 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Server Form */}
        <div className="px-3 mt-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="new-blossom-url" className="sr-only">
                Blossom Server URL
              </Label>
              <Input
                id="new-blossom-url"
                value={newServerUrl}
                onChange={(e) => setNewServerUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddServer();
                }}
                placeholder="https://blossom.example.com/"
                className="h-9 text-sm font-mono"
              />
            </div>
            <Button
              onClick={handleAddServer}
              disabled={!newServerUrl.trim()}
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
              Log in to sync your Blossom server list with Nostr
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
