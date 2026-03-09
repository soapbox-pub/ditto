import { useState, useEffect } from 'react';
import { Plus, X, Wifi, Search, Radio, MessageSquare } from 'lucide-react';
import { HelpTip } from '@/components/HelpTip';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { APP_RELAYS } from '@/lib/appRelays';

interface Relay {
  url: string;
  read: boolean;
  write: boolean;
}

export function RelayListManager() {
  const { config, updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();

  const [relays, setRelays] = useState<Relay[]>(config.relayMetadata.relays);

  const messaging = config.messaging ?? {};
  const discoveryRelays = messaging.discoveryRelays ?? APP_RELAYS.relays.map(r => r.url);
  const dmInboxRelays = messaging.dmInboxRelays ?? [];

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

  const renderRelayUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'wss:') {
        return parsed.pathname === '/' ? parsed.host : parsed.host + parsed.pathname;
      }
      return parsed.href;
    } catch {
      return url;
    }
  };

  // --- Inbox/Outbox (NIP-65 kind 10002) ---

  const handleSetRead = (url: string, value: boolean) => {
    const relay = relays.find(r => r.url === url);
    if (!relay) return;
    if (!value && !relay.write) {
      const newRelays = relays.filter(r => r.url !== url);
      setRelays(newRelays);
      saveRelays(newRelays);
    } else {
      const newRelays = relays.map(r => (r.url === url ? { ...r, read: value } : r));
      setRelays(newRelays);
      saveRelays(newRelays);
    }
  };

  const handleSetWrite = (url: string, value: boolean) => {
    const relay = relays.find(r => r.url === url);
    if (!relay) return;
    if (!value && !relay.read) {
      const newRelays = relays.filter(r => r.url !== url);
      setRelays(newRelays);
      saveRelays(newRelays);
    } else {
      const newRelays = relays.map(r => (r.url === url ? { ...r, write: value } : r));
      setRelays(newRelays);
      saveRelays(newRelays);
    }
  };

  const handleRemoveRelay = (url: string) => {
    const newRelays = relays.filter(r => r.url !== url);
    setRelays(newRelays);
    saveRelays(newRelays);
  };

  const saveRelays = (newRelays: Relay[]) => {
    const now = Math.floor(Date.now() / 1000);
    updateConfig((current) => ({
      ...current,
      relayMetadata: { relays: newRelays, updatedAt: now },
    }));
    if (user) publishNIP65RelayList(newRelays);
  };

  const publishNIP65RelayList = (relayList: Relay[]) => {
    const tags = relayList.map(relay => {
      if (relay.read && relay.write) return ['r', relay.url];
      if (relay.read) return ['r', relay.url, 'read'];
      if (relay.write) return ['r', relay.url, 'write'];
      return null;
    }).filter((tag): tag is string[] => tag !== null);

    publishEvent(
      { kind: 10002, content: '', tags },
      {
        onSuccess: () => toast({ title: 'Relay list published', description: 'Your relay list has been published to Nostr.' }),
        onError: (error) => {
          console.error('Failed to publish relay list:', error);
          toast({ title: 'Failed to publish relay list', description: 'There was an error publishing your relay list to Nostr.', variant: 'destructive' });
        },
      }
    );
  };

  // --- Discovery relays ---

  const handleAddDiscoveryRelay = (url: string) => {
    const input = url.trim();
    if (!input) return;
    const normalized = input.startsWith('wss://') || input.startsWith('ws://') ? input : `wss://${input}`;
    if (discoveryRelays.includes(normalized)) return;
    updateConfig((prev) => ({
      ...prev,
      messaging: { ...prev.messaging, discoveryRelays: [...discoveryRelays, normalized] },
    }));
  };

  const handleRemoveDiscoveryRelay = (url: string) => {
    updateConfig((prev) => ({
      ...prev,
      messaging: { ...prev.messaging, discoveryRelays: discoveryRelays.filter((r) => r !== url) },
    }));
  };

  // --- DM inbox relays (kind 10050) ---

  const saveDMInboxRelays = (newRelays: string[]) => {
    updateConfig((current) => ({
      ...current,
      messaging: { ...messaging, dmInboxRelays: newRelays },
    }));
    if (user) publishDMInboxRelayList(newRelays);
  };

  const publishDMInboxRelayList = (relayUrls: string[]) => {
    const tags = relayUrls.map(url => ['relay', url]);
    publishEvent(
      { kind: 10050, content: '', tags },
      {
        onSuccess: () => toast({ title: 'DM inbox relays published', description: 'Your DM inbox relay list has been published to Nostr.' }),
        onError: (error) => {
          console.error('Failed to publish DM inbox relays:', error);
          toast({ title: 'Failed to publish DM inbox relays', description: 'There was an error publishing your DM inbox relay list.', variant: 'destructive' });
        },
      }
    );
  };

  const handleAddDMInboxRelay = (url: string) => {
    if (!isValidRelayUrl(url)) {
      toast({ title: 'Invalid relay URL', description: 'Please enter a valid relay URL (e.g., wss://relay.example.com)', variant: 'destructive' });
      return;
    }
    const normalized = normalizeRelayUrl(url);
    if (dmInboxRelays.includes(normalized)) {
      toast({ title: 'Relay already exists', description: 'This relay is already in your DM inbox list.', variant: 'destructive' });
      return;
    }
    saveDMInboxRelays([...dmInboxRelays, normalized]);
  };

  const handleRemoveDMInboxRelay = (url: string) => {
    saveDMInboxRelays(dmInboxRelays.filter(r => r !== url));
  };

  // --- Reusable add-relay form ---

  const AddRelayForm = ({ id, onAdd, placeholder }: { id: string; onAdd: (url: string) => void; placeholder: string }) => {
    const [localUrl, setLocalUrl] = useState('');
    const handleAdd = () => { onAdd(localUrl); setLocalUrl(''); };
    return (
      <div className="flex gap-2">
        <div className="flex-1">
          <Label htmlFor={id} className="sr-only">Relay URL</Label>
          <Input
            id={id}
            placeholder={placeholder}
            value={localUrl}
            onChange={(e) => setLocalUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            className="h-9 text-sm"
          />
        </div>
        <Button onClick={handleAdd} disabled={!localUrl.trim()} variant="outline" size="sm" className="h-9 shrink-0 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="discovery" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="discovery" className="gap-1.5 text-xs">
            <Search className="h-3.5 w-3.5" />
            Discovery
          </TabsTrigger>
          <TabsTrigger value="inbox-outbox" className="gap-1.5 text-xs">
            <Radio className="h-3.5 w-3.5" />
            Inbox/Outbox
          </TabsTrigger>
          <TabsTrigger value="dms" className="gap-1.5 text-xs">
            <MessageSquare className="h-3.5 w-3.5" />
            DMs
          </TabsTrigger>
        </TabsList>

        {/* Discovery relays */}
        <TabsContent value="discovery" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground px-3">
            Used to find your relay lists and as default relay pool for DMs.
          </p>
          {discoveryRelays.length === 0 ? (
            <div className="text-center py-6 px-4 border border-dashed rounded-lg text-muted-foreground text-sm">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No discovery relays</p>
            </div>
          ) : (
            <div className="space-y-1">
              {discoveryRelays.map((url) => (
                <div key={url} className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors">
                  <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs flex-1 truncate" title={url}>
                    {renderRelayUrl(url)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveDiscoveryRelay(url)}
                    className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="px-3">
            <Label className="text-xs font-medium">Add Relay</Label>
            <AddRelayForm id="discovery-relay-url" onAdd={handleAddDiscoveryRelay} placeholder="wss://relay.example.com" />
          </div>
        </TabsContent>

        {/* Inbox/Outbox (NIP-65 kind 10002) */}
        <TabsContent value="inbox-outbox" className="space-y-4 mt-4">
          <div className="px-3 space-y-1">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              Your Relays <HelpTip faqId="what-are-relays" iconSize="size-3.5" />
            </h3>
            <p className="text-xs text-muted-foreground">
              Read = inbox for receiving. Write = where you publish. Synced to Nostr when logged in.
            </p>
          </div>

          {relays.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center px-3">
              No personal relays configured. Add relays below.
            </div>
          ) : (
            <div className="space-y-1">
              {relays.map((relay) => (
                <div key={relay.url} className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors">
                  <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs flex-1 truncate min-w-0" title={relay.url}>
                    {renderRelayUrl(relay.url)}
                  </span>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`read-${relay.url}`} className="text-xs">Read</Label>
                      <Switch
                        id={`read-${relay.url}`}
                        checked={relay.read}
                        onCheckedChange={(checked) => handleSetRead(relay.url, checked)}
                        className="scale-75"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor={`write-${relay.url}`} className="text-xs">Write</Label>
                      <Switch
                        id={`write-${relay.url}`}
                        checked={relay.write}
                        onCheckedChange={(checked) => handleSetWrite(relay.url, checked)}
                        className="scale-75"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveRelay(relay.url)}
                      className="size-7 text-muted-foreground hover:text-destructive hover:bg-transparent shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-3">
            <Label className="text-xs font-medium">Add Relay</Label>
            <AddRelayForm
              id="inbox-outbox-relay-url"
              onAdd={(url) => {
                if (!isValidRelayUrl(url)) {
                  toast({ title: 'Invalid relay URL', description: 'Please enter a valid relay URL (e.g., wss://relay.example.com)', variant: 'destructive' });
                  return;
                }
                const normalized = normalizeRelayUrl(url);
                if (relays.some(r => r.url === normalized)) {
                  toast({ title: 'Relay already exists', description: 'Adjust Read/Write toggles for this relay above.', variant: 'destructive' });
                  return;
                }
                const newRelays = [...relays, { url: normalized, read: true, write: true }];
                setRelays(newRelays);
                saveRelays(newRelays);
              }}
              placeholder="wss://relay.example.com"
            />
            {!user && (
              <p className="text-[10px] text-muted-foreground mt-2">
                Log in to sync your relay list with Nostr
              </p>
            )}
          </div>
        </TabsContent>

        {/* DM inbox relays (kind 10050) */}
        <TabsContent value="dms" className="space-y-4 mt-4">
          <p className="text-xs text-muted-foreground px-3">
            DM inbox relays (kind 10050) are where others send you direct messages.
          </p>
          {dmInboxRelays.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center px-3">
              No DM inbox relays configured
            </div>
          ) : (
            <div className="space-y-1">
              {dmInboxRelays.map((url) => (
                <div key={url} className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors">
                  <Wifi className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="font-mono text-xs flex-1 truncate" title={url}>
                    {renderRelayUrl(url)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveDMInboxRelay(url)}
                    className="size-7 text-muted-foreground hover:text-destructive shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="px-3">
            <Label className="text-xs font-medium">Add Relay</Label>
            <AddRelayForm id="dm-inbox-relay-url" onAdd={handleAddDMInboxRelay} placeholder="wss://relay.example.com" />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
