import { useState } from 'react';
import { ChevronDown, ChevronUp, Users, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/useToast';

export function ContentSettings() {
  const [otherStuffOpen, setOtherStuffOpen] = useState(true);
  const [feedTabsOpen, setFeedTabsOpen] = useState(false);
  const [mutesOpen, setMutesOpen] = useState(false);

  return (
    <div>
      {/* Intro */}
      <div className="flex items-center gap-4 px-3 pt-2 pb-4">
        <img
          src="/feed-intro.png"
          alt=""
          className="w-40 shrink-0 mix-blend-difference opacity-80"
        />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">What You See</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Customize your feed, choose what content appears, and control what you want to hide.
          </p>
        </div>
      </div>

      {/* Feed Tabs Section */}
      <div className="border-b-2 border-primary">
        <Collapsible open={feedTabsOpen} onOpenChange={setFeedTabsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 rounded-none"
            >
              <span className="text-base font-semibold">Feed Tabs</span>
              {feedTabsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              <FeedTabsSection />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Other Stuff Section */}
      <div>
        <Collapsible open={otherStuffOpen} onOpenChange={setOtherStuffOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 rounded-none border-b-2 border-primary"
            >
              <span className="text-base font-semibold">Other Stuff</span>
              {otherStuffOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              <p className="text-xs text-muted-foreground px-3 pb-3 pt-3">
                Nostr isn't just text posts — people publish all kinds of things. Pick what shows up in your sidebar and feed.
              </p>

              {/* Column headers */}
              <div className="flex items-center justify-end gap-2 px-3 pb-2 border-b border-border">
                <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Sidebar</span>
                <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Feed</span>
              </div>

              {/* Content type rows - reuse the internals from FeedSettingsForm */}
              <FeedSettingsFormInternals />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Muted Content Section */}
      <div className="border-b-2 border-primary">
        <Collapsible open={mutesOpen} onOpenChange={setMutesOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 rounded-none"
            >
              <span className="text-base font-semibold">Muted Content</span>
              {mutesOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              {/* Intro section for Muted Content */}
              <div className="flex items-center gap-4 px-3 pt-3 pb-4">
                <img
                  src="/mute-intro.png"
                  alt=""
                  className="w-40 shrink-0 mix-blend-difference opacity-80"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Content Control</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Hide posts from specific users, hashtags, words, or entire threads. All mutes are encrypted and private.
                  </p>
                </div>
              </div>
              <MuteSettingsInternals />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* TODO: Sensitive Content Section */}
    </div>
  );
}

// Import the internals from FeedSettingsForm (we'll need to export them)
import { Clapperboard, BarChart3, Palette, PartyPopper } from 'lucide-react';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { Switch } from '@/components/ui/switch';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { EXTRA_KINDS } from '@/lib/extraKinds';
import type { ExtraKindDef, SubKindDef } from '@/lib/extraKinds';
import { cn } from '@/lib/utils';

/** Map route name → lucide icon. */
const ICONS: Record<string, React.ReactNode> = {
  vines: <Clapperboard className="size-5" />,
  polls: <BarChart3 className="size-5" />,
  treasures: <ChestIcon className="size-5" />,
  colors: <Palette className="size-5" />,
  packs: <PartyPopper className="size-5" />,
};

function KindBadge({ kind }: { kind: number }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
      [{kind}]
    </span>
  );
}

function SubKindRow({ sub, parentEnabled }: { sub: SubKindDef; parentEnabled: boolean }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const handleToggle = async (key: string, value: boolean) => {
    updateFeedSettings({ [key]: value });
    if (user) {
      const updatedFeedSettings = { ...feedSettings, [key]: value };
      await updateSettings.mutateAsync({ feedSettings: updatedFeedSettings });
    }
  };

  return (
    <div className={cn(
      'flex items-center justify-between py-2.5 pl-12 pr-3 transition-colors',
      !parentEnabled && 'opacity-40 pointer-events-none',
    )}>
      <div className="min-w-0">
        <span className="text-sm">{sub.label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">
          <KindBadge kind={sub.kind} />{' '}{sub.description}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-[52px] flex justify-center">
          <Switch
            checked={feedSettings[sub.showKey]}
            onCheckedChange={(checked) => handleToggle(sub.showKey, checked)}
            className="scale-90"
          />
        </div>
        <div className="w-[52px] flex justify-center">
          <Switch
            checked={feedSettings[sub.feedKey]}
            onCheckedChange={(checked) => handleToggle(sub.feedKey, checked)}
            className="scale-90"
          />
        </div>
      </div>
    </div>
  );
}

function ContentTypeRow({ def }: { def: ExtraKindDef }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const icon = ICONS[def.route] ?? <Palette className="size-5" />;
  const hasSubKinds = !!def.subKinds;

  const handleToggle = async (key: string, value: boolean) => {
    updateFeedSettings({ [key]: value });
    if (user) {
      const updatedFeedSettings = { ...feedSettings, [key]: value };
      await updateSettings.mutateAsync({ feedSettings: updatedFeedSettings });
    }
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center justify-between py-3.5 px-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-muted-foreground shrink-0">{icon}</span>
          <div className="min-w-0">
            <span className="text-sm font-medium">{def.label}</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              <KindBadge kind={def.kind} />{' '}{def.description}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-[52px] flex justify-center">
            <Switch
              checked={feedSettings[def.showKey]}
              onCheckedChange={(checked) => handleToggle(def.showKey, checked)}
            />
          </div>
          <div className="w-[52px] flex justify-center">
            {!hasSubKinds && def.feedKey ? (
              <Switch
                checked={feedSettings[def.feedKey]}
                onCheckedChange={(checked) => handleToggle(def.feedKey, checked)}
              />
            ) : null}
          </div>
        </div>
      </div>

      {hasSubKinds && def.subKinds!.map((sub) => (
        <SubKindRow
          key={sub.showKey}
          sub={sub}
          parentEnabled={feedSettings[def.showKey]}
        />
      ))}
    </div>
  );
}

function FeedSettingsFormInternals() {
  return (
    <>
      {EXTRA_KINDS.map((def) => (
        <ContentTypeRow key={def.showKey} def={def} />
      ))}
    </>
  );
}

// Feed Tabs Section Component
function FeedTabsSection() {
  const { toast } = useToast();
  const [communityDomain, setCommunityDomain] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [communities, setCommunities] = useState<Array<{ domain: string; userCount: number }>>([]);
  const [showGlobalFeed, setShowGlobalFeed] = useState(() => {
    const stored = localStorage.getItem('mew:showGlobalFeed');
    return stored !== null ? stored === 'true' : true; // Default to true
  });

  const handleToggleGlobalFeed = (checked: boolean) => {
    setShowGlobalFeed(checked);
    localStorage.setItem('mew:showGlobalFeed', String(checked));
    toast({
      title: checked ? 'Global feed enabled' : 'Global feed disabled',
      description: checked 
        ? 'The Global feed tab will appear in your navigation'
        : 'The Global feed tab will be hidden',
    });
  };

  const handleDownloadCommunity = async () => {
    if (!communityDomain.trim()) {
      toast({
        title: 'Domain required',
        description: 'Please enter a domain name',
        variant: 'destructive',
      });
      return;
    }

    // Clean up domain input
    let domain = communityDomain.trim().toLowerCase();
    // Remove protocol if present
    domain = domain.replace(/^https?:\/\//, '');
    // Remove trailing slash
    domain = domain.replace(/\/$/, '');

    // Check if already added
    if (communities.some(c => c.domain === domain)) {
      toast({
        title: 'Already added',
        description: 'This community is already in your list',
        variant: 'destructive',
      });
      return;
    }

    setIsDownloading(true);
    try {
      // Fetch the NIP-05 JSON
      const response = await fetch(`https://${domain}/.well-known/nostr.json`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.names || typeof data.names !== 'object') {
        throw new Error('Invalid NIP-05 JSON format');
      }

      const userCount = Object.keys(data.names).length;

      // Store in localStorage
      const newCommunity = { domain, userCount };
      const updatedCommunities = [...communities, newCommunity];
      setCommunities(updatedCommunities);
      localStorage.setItem('mew:communities', JSON.stringify(updatedCommunities));
      
      // Store the actual JSON data for later use
      localStorage.setItem(`mew:community:${domain}`, JSON.stringify(data));

      toast({
        title: 'Community added',
        description: `Added ${domain} with ${userCount} users`,
      });

      setCommunityDomain('');
    } catch (error) {
      console.error('Failed to download community:', error);
      toast({
        title: 'Failed to download',
        description: error instanceof Error ? error.message : 'Could not fetch community data',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleRemoveCommunity = (domain: string) => {
    const updatedCommunities = communities.filter(c => c.domain !== domain);
    setCommunities(updatedCommunities);
    localStorage.setItem('mew:communities', JSON.stringify(updatedCommunities));
    localStorage.removeItem(`mew:community:${domain}`);
    
    toast({
      title: 'Community removed',
      description: `Removed ${domain}`,
    });
  };

  // Load communities from localStorage on mount
  useState(() => {
    const stored = localStorage.getItem('mew:communities');
    if (stored) {
      try {
        setCommunities(JSON.parse(stored));
      } catch (error) {
        console.error('Failed to load communities:', error);
      }
    }
  });

  return (
    <div className="px-3 space-y-4">
      <p className="text-xs text-muted-foreground">
        Manage which feed tabs appear in your navigation and follow communities by domain.
      </p>

      {/* Feed Tab Toggles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between py-2.5 px-3 border rounded-lg">
          <div>
            <Label className="text-sm font-medium">Global Feed</Label>
            <p className="text-xs text-muted-foreground">Show posts from all users across the network</p>
          </div>
          <Switch
            checked={showGlobalFeed}
            onCheckedChange={handleToggleGlobalFeed}
            className="scale-90"
          />
        </div>
      </div>

      {/* Community Management */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">Communities</Label>
        </div>
        
        <p className="text-xs text-muted-foreground">
          Add a community by entering its domain. We'll download the NIP-05 user list and create a feed tab for verified members.
        </p>

        <div className="flex gap-2">
          <Input
            placeholder="spinster.xyz"
            value={communityDomain}
            onChange={(e) => setCommunityDomain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleDownloadCommunity();
              }
            }}
            className="h-9"
            disabled={isDownloading}
          />
          <Button
            onClick={handleDownloadCommunity}
            disabled={isDownloading || !communityDomain.trim()}
            size="sm"
            className="h-9"
          >
            {isDownloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Communities List */}
        {communities.length > 0 && (
          <div className="space-y-2">
            {communities.map((community) => (
              <div
                key={community.domain}
                className="flex items-center justify-between py-2.5 px-3 border rounded-lg hover:bg-muted/20 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{community.domain}</p>
                    <p className="text-xs text-muted-foreground">
                      {community.userCount} {community.userCount === 1 ? 'user' : 'users'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveCommunity(community.domain)}
                  className="shrink-0 h-8 w-8 p-0"
                >
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// Mute settings internals (without the intro/image)
import { Trash2, Plus, UserX, Hash, MessageSquareOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/useToast';
import { useMuteList, type MuteListItem } from '@/hooks/useMuteList';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MUTE_TYPE_CONFIG = {
  pubkey: {
    icon: <UserX className="size-5" />,
    label: 'Users',
    description: 'Hide posts from specific users',
    inputLabel: 'Public Key (hex or npub)',
    placeholder: 'npub1... or hex pubkey',
  },
  hashtag: {
    icon: <Hash className="size-5" />,
    label: 'Hashtags',
    description: 'Hide posts with specific hashtags',
    inputLabel: 'Hashtag (without #)',
    placeholder: 'bitcoin',
  },
  word: {
    icon: <MessageSquareOff className="size-5" />,
    label: 'Words',
    description: 'Hide posts containing specific words or phrases',
    inputLabel: 'Word or Phrase',
    placeholder: 'spam word',
  },
  thread: {
    icon: <MessageSquareOff className="size-5" />,
    label: 'Threads',
    description: 'Hide entire conversation threads',
    inputLabel: 'Event ID (hex or note)',
    placeholder: 'note1... or hex event ID',
  },
};

function MuteSettingsInternals() {
  const { muteItems, isLoading, addMute, removeMute } = useMuteList();
  const { toast } = useToast();
  const [newMuteType, setNewMuteType] = useState<MuteListItem['type']>('pubkey');
  const [newMuteValue, setNewMuteValue] = useState('');

  const handleAddMute = async () => {
    if (!newMuteValue.trim()) {
      toast({ title: 'Error', description: 'Please enter a value', variant: 'destructive' });
      return;
    }

    try {
      await addMute.mutateAsync({
        type: newMuteType,
        value: newMuteValue.trim(),
      });

      toast({ title: 'Success', description: 'Mute added successfully' });
      setNewMuteValue('');
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add mute',
        variant: 'destructive',
      });
    }
  };

  const handleRemoveMute = async (item: MuteListItem) => {
    try {
      await removeMute.mutateAsync(item);
      toast({ title: 'Success', description: 'Mute removed successfully' });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove mute',
        variant: 'destructive',
      });
    }
  };

  const groupedMutes = {
    pubkey: muteItems.filter((item) => item.type === 'pubkey'),
    hashtag: muteItems.filter((item) => item.type === 'hashtag'),
    word: muteItems.filter((item) => item.type === 'word'),
    thread: muteItems.filter((item) => item.type === 'thread'),
  };

  return (
    <div>

      {/* Add mute section */}
      <div className="border-b border-border pb-4 mb-4">
        <div className="px-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="mute-type" className="text-xs font-medium">Type</Label>
              <Select value={newMuteType} onValueChange={(value) => setNewMuteType(value as MuteListItem['type'])}>
                <SelectTrigger id="mute-type" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pubkey">
                    <div className="flex items-center gap-2">
                      <UserX className="h-4 w-4" />
                      User
                    </div>
                  </SelectItem>
                  <SelectItem value="hashtag">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4" />
                      Hashtag
                    </div>
                  </SelectItem>
                  <SelectItem value="word">
                    <div className="flex items-center gap-2">
                      <MessageSquareOff className="h-4 w-4" />
                      Word/Phrase
                    </div>
                  </SelectItem>
                  <SelectItem value="thread">
                    <div className="flex items-center gap-2">
                      <MessageSquareOff className="h-4 w-4" />
                      Thread
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mute-value" className="text-xs font-medium">
                {MUTE_TYPE_CONFIG[newMuteType].inputLabel}
              </Label>
              <Input
                id="mute-value"
                value={newMuteValue}
                onChange={(e) => setNewMuteValue(e.target.value)}
                placeholder={MUTE_TYPE_CONFIG[newMuteType].placeholder}
                className="h-9"
              />
            </div>
          </div>

          <Button 
            onClick={handleAddMute} 
            disabled={addMute.isPending} 
            size="sm"
            className="w-full sm:w-auto"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Mute
          </Button>
        </div>
      </div>

      {/* Muted items list */}
      {isLoading ? (
        <div className="space-y-2 px-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : muteItems.length === 0 ? (
        <p className="text-muted-foreground text-center py-8 text-sm">
          No muted items yet
        </p>
      ) : (
        <>
          {Object.entries(groupedMutes).map(([type, items]) => {
            if (items.length === 0) return null;
            const config = MUTE_TYPE_CONFIG[type as MuteListItem['type']];
            
            return (
              <MuteTypeSection
                key={type}
                type={type as MuteListItem['type']}
                config={config}
                items={items}
                onRemove={handleRemoveMute}
                isPending={removeMute.isPending}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

function MuteTypeSection({
  type,
  config,
  items,
  onRemove,
  isPending,
}: {
  type: MuteListItem['type'];
  config: typeof MUTE_TYPE_CONFIG[keyof typeof MUTE_TYPE_CONFIG];
  items: MuteListItem[];
  onRemove: (item: MuteListItem) => void;
  isPending: boolean;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-3 px-3 py-3.5 bg-muted/30">
        <span className="text-muted-foreground shrink-0">{config.icon}</span>
        <div className="min-w-0">
          <span className="text-sm font-medium">{config.label}</span>
          <p className="text-xs text-muted-foreground mt-0.5">
            {items.length} {items.length === 1 ? 'item' : 'items'} • {config.description}
          </p>
        </div>
      </div>
      
      <div className="divide-y divide-border">
        {items.map((item, index) => (
          <div
            key={`${item.type}-${item.value}-${index}`}
            className="flex items-center justify-between py-2.5 px-3 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <code className="text-xs truncate font-mono bg-muted px-2 py-1 rounded">
                {item.value}
              </code>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(item)}
              disabled={isPending}
              className="shrink-0 h-8 w-8 p-0"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
