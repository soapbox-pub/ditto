import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';
import { useDMContext } from '@/components/DMProviderWrapper';
import { RelayListManager } from '@/components/RelayListManager';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, AlertCircle, Play } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { DEFAULT_NEW_MESSAGE_SOUNDS, getMediaCacheStats, type RelayMode } from '@samthomson/nostr-messaging/core';
import { IntroImage } from '@/components/IntroImage';

export default function MessagingSettings() {
  const { config, updateConfig } = useAppContext();
  const { 
    subscriptions, 
    messagingState, 
    isLoading: dmIsLoading,
    clearCacheAndRefetch,
  } = useDMContext();

  const messaging = config.messaging ?? {};

  const [mediaCacheStats, setMediaCacheStats] = useState<{ count: number; size: number } | null>(null);

  useSeoMeta({
    title: 'Messages | Settings | Ditto',
    description: 'Configure your direct messaging settings.',
  });

  useEffect(() => {
    getMediaCacheStats().then(setMediaCacheStats).catch(() => {
      setMediaCacheStats({ count: 0, size: 0 });
    });
  }, []);

  const preloadedSoundsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  useEffect(() => {
    const map = new Map<string, HTMLAudioElement>();
    DEFAULT_NEW_MESSAGE_SOUNDS.forEach((sound) => {
      const audio = new Audio(sound.url);
      audio.volume = 0.5;
      audio.preload = 'auto';
      map.set(sound.url, audio);
    });
    preloadedSoundsRef.current = map;
    return () => {
      map.clear();
    };
  }, []);

  const relayMode = messaging.relayMode ?? 'hybrid';
  const renderInlineMedia = messaging.renderInlineMedia ?? true;
  const soundEnabled = messaging.soundEnabled ?? false;
  const soundId = messaging.soundId ?? DEFAULT_NEW_MESSAGE_SOUNDS[0]?.id ?? '';
  const devMode = messaging.devMode ?? false;

  const handleRelayModeChange = (mode: string) => {
    updateConfig((prev) => ({
      ...prev,
      messaging: { ...messaging, relayMode: mode as RelayMode },
    }));
  };

  const handleRenderInlineMediaChange = (checked: boolean) => {
    updateConfig((prev) => ({
      ...prev,
      messaging: { ...messaging, renderInlineMedia: checked },
    }));
  };

  const handleSoundIdChange = (id: string) => {
    updateConfig((prev) => ({
      ...prev,
      messaging: { ...messaging, soundEnabled: true, soundId: id },
    }));
  };

  const handleDevModeChange = (checked: boolean) => {
    updateConfig((prev) => ({
      ...prev,
      messaging: { ...messaging, devMode: checked },
    }));
  };

  const handlePlaySound = useCallback((soundUrl: string) => {
    try {
      const preloaded = preloadedSoundsRef.current.get(soundUrl);
      if (preloaded) {
        preloaded.currentTime = 0;
        preloaded.play().catch(() => {});
      } else {
        const audio = new Audio(soundUrl);
        audio.volume = 0.5;
        audio.play().catch(() => {});
      }
    } catch {
      // Ignore errors
    }
  }, []);

  const handleClearCache = async () => {
    if (confirm('This will clear all cached messages and re-fetch from relays. Continue?')) {
      await clearCacheAndRefetch();
      const stats = await getMediaCacheStats();
      setMediaCacheStats(stats);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const conversationCount = messagingState ? Object.keys(messagingState.conversationMetadata).length : 0;
  const totalMessages = messagingState
    ? Object.values(messagingState.conversationMessages).reduce((sum, msgs) => sum + msgs.length, 0)
    : 0;
  const lastSync = messagingState?.syncState?.lastCacheTime
    ? new Date(messagingState.syncState.lastCacheTime).toLocaleString()
    : 'Never';

  return (
    <main className="">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Messages</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure direct messaging settings, relays, and cache
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4 px-3 pt-2 pb-4">
          <IntroImage src="/messaging-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Direct Messaging</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Manage your encrypted messaging settings and relay connections
            </p>
          </div>
        </div>

        <div className="space-y-6">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>General</CardTitle>
            <CardDescription>
              Configure how messages are displayed and notified
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="render-inline-media">Render Inline Media</Label>
                <p className="text-sm text-muted-foreground">
                  Show images and videos directly in messages
                </p>
              </div>
              <Switch
                id="render-inline-media"
                checked={renderInlineMedia}
                onCheckedChange={handleRenderInlineMediaChange}
              />
            </div>

            <div className="border-t border-border/50 pt-6">
              <div className="space-y-3">
                <Label>Sound</Label>
                <p className="text-sm text-muted-foreground mb-3">
                  Play a sound when a DM arrives
                </p>
                <RadioGroup value={soundEnabled ? soundId : 'none'} onValueChange={(val) => {
                  if (val === 'none') {
                    updateConfig((prev) => ({
                      ...prev,
                      messaging: { ...messaging, soundEnabled: false },
                    }));
                  } else {
                    handleSoundIdChange(val);
                  }
                }}>
                  <div className="flex items-center justify-between space-x-3 space-y-0 group">
                    <div className="flex items-center space-x-3">
                      <RadioGroupItem value="none" id="sound-none" />
                      <Label htmlFor="sound-none" className="font-normal cursor-pointer">
                        None
                      </Label>
                    </div>
                  </div>
                  {DEFAULT_NEW_MESSAGE_SOUNDS.map((sound) => (
                    <div
                      key={sound.id}
                      className="flex items-center justify-between space-x-3 space-y-0 group"
                    >
                      <div className="flex items-center space-x-3">
                        <RadioGroupItem value={sound.id} id={`sound-${sound.id}`} />
                        <Label
                          htmlFor={`sound-${sound.id}`}
                          className="font-normal cursor-pointer"
                        >
                          {sound.label}
                        </Label>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handlePlaySound(sound.url)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Relay Mode</CardTitle>
            <CardDescription>
              Control how relays are chosen for direct messages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <Label>Connection Mode</Label>
              <RadioGroup value={relayMode} onValueChange={handleRelayModeChange}>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="discovery" id="mode-discovery" />
                  <div className="space-y-1">
                    <Label htmlFor="mode-discovery" className="font-normal cursor-pointer">
                      Discovery Only
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Only relays from the discovery list; fastest, may miss messages
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="hybrid" id="mode-hybrid" />
                  <div className="space-y-1">
                    <Label htmlFor="mode-hybrid" className="font-normal cursor-pointer">
                      Hybrid <Badge variant="secondary" className="ml-2">Recommended</Badge>
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Discovery relays + user inbox relays
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="strict_outbox" id="mode-strict" />
                  <div className="space-y-1">
                    <Label htmlFor="mode-strict" className="font-normal cursor-pointer">
                      Strict Outbox
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Only each user's published inbox relays (NIP-65/NIP-17). More private, but not everyone publishes relay lists yet - you may miss DMs to or from people who don't.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Relays</CardTitle>
            <CardDescription>
              Discovery relays, NIP-65 inbox/outbox, and DM inbox
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RelayListManager />
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Cache & Storage</CardTitle>
            <CardDescription>
              View cache status and manage stored messages
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label>Connection Status</Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-secondary/20 p-3 rounded-lg">
                  <div className="text-sm font-medium mb-1">NIP-04 (Legacy)</div>
                  <Badge variant={subscriptions.isNIP4Connected ? 'default' : 'secondary'}>
                    {subscriptions.isNIP4Connected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
                <div className="bg-secondary/20 p-3 rounded-lg">
                  <div className="text-sm font-medium mb-1">NIP-17 (Private)</div>
                  <Badge variant={subscriptions.isNIP17Connected ? 'default' : 'secondary'}>
                    {subscriptions.isNIP17Connected ? 'Connected' : 'Disconnected'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="border-t border-border/50 pt-6">
              <div className="space-y-3">
                <Label>Cache Statistics</Label>
                <div className="bg-secondary/20 p-4 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Conversations:</span>
                    <span className="font-medium">{conversationCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Messages:</span>
                    <span className="font-medium">{totalMessages}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Last Sync:</span>
                    <span className="font-medium">{lastSync}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Media Files Cached:</span>
                    <span className="font-medium">{mediaCacheStats?.count ?? '...'}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Media Cache Size:</span>
                    <span className="font-medium">
                      {mediaCacheStats ? formatBytes(mediaCacheStats.size) : '...'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-border/50 pt-6">
              <Button
                variant="destructive"
                onClick={handleClearCache}
                disabled={dmIsLoading}
                className="w-full"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Clear Cache & Refetch
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                This will clear all cached messages and re-fetch from relays. Use this if messages are missing or out of sync.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader>
            <CardTitle>Advanced</CardTitle>
            <CardDescription>
              Developer and debugging options
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="dev-mode">Developer Mode</Label>
                <p className="text-sm text-muted-foreground">
                  Show extra debug UI (seal payload, decryption details)
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Only enable if you need to debug message encryption
                  </span>
                </div>
              </div>
              <Switch
                id="dev-mode"
                checked={devMode}
                onCheckedChange={handleDevModeChange}
              />
            </div>
          </CardContent>
        </Card>
        </div>
      </div>
    </main>
  );
}
