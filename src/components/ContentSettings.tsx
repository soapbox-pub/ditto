import { useState } from 'react';
import { IntroImage } from '@/components/IntroImage';
import { ChevronDown, ChevronUp, Users, Download, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/useToast';

export function ContentSettings() {
  const [notesOpen, setNotesOpen] = useState(true);
  const [otherStuffOpen, setOtherStuffOpen] = useState(true);
  const [feedTabsOpen, setFeedTabsOpen] = useState(false);

  return (
    <div>
      {/* Intro */}
      <div className="px-3 pt-2 pb-4">
        <h2 className="text-sm font-semibold">What You See</h2>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
          Customize your feed, choose what content appears, and control what you want to hide.
        </p>
      </div>

      {/* Feed Tabs Section */}
      <div>
        <Collapsible open={feedTabsOpen} onOpenChange={setFeedTabsOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Feed Tabs</span>
              {feedTabsOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              <FeedTabsSection />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Notes Section */}
      <div>
        <Collapsible open={notesOpen} onOpenChange={setNotesOpen}>
          <CollapsibleTrigger asChild>
            <Button 
              variant="ghost" 
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Notes</span>
              {notesOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              <div className="px-3 pt-3 pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Core content types that appear in your feed.
                </p>
              </div>

              {/* Column headers */}
              <div className="flex items-center justify-end gap-2 px-3 pb-2 border-b border-border">
                <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Feed</span>
              </div>

              <NotesFeedSettings />
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
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">Other Stuff</span>
              {otherStuffOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pb-4">
              {/* Intro section for Other Stuff */}
              <div className="flex items-center gap-4 px-3 pt-3 pb-4">
                <IntroImage src="/feed-intro.png" />
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold">Other Stuff</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Nostr isn't just text posts — people publish all kinds of things. Pick what shows up in your sidebar and feed.
                  </p>
                </div>
              </div>

              {/* Column headers */}
              <div className="flex items-center justify-end gap-2 px-3 pb-2 border-b border-border">
                <span className="text-[11px] font-medium text-muted-foreground w-[52px] text-center">Feed</span>
              </div>

              {/* Content type rows - reuse the internals from FeedSettingsForm */}
              <FeedSettingsFormInternals />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

    </div>
  );
}

// Import the internals from FeedSettingsForm (we'll need to export them)
import { Palette } from 'lucide-react';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { EXTRA_KINDS, FEED_KINDS, SECTION_ORDER, SECTION_LABELS } from '@/lib/extraKinds';
import type { ExtraKindDef, SubKindDef } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';

function KindBadge({ kind }: { kind: number }) {
  return (
    <span className="text-[10px] font-mono text-muted-foreground/60 shrink-0">
      [{kind}]
    </span>
  );
}

function SubKindRow({ sub }: { sub: SubKindDef }) {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const handleToggle = async (key: string, value: boolean) => {
    updateFeedSettings({ [key]: value });
    if (user) {
      await updateSettings.mutateAsync({ feedSettings: { ...feedSettings, [key]: value } });
    }
  };

  return (
    <div className="flex items-center justify-between py-2.5 pl-12 pr-3 transition-colors">
      <div className="min-w-0">
        <span className="text-sm">{sub.label}</span>
        <p className="text-xs text-muted-foreground mt-0.5">
          <KindBadge kind={sub.kind} />{' '}{sub.description}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
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
  const IconComponent = CONTENT_KIND_ICONS[def.id] ?? Palette;
  const icon = <IconComponent className="size-5" />;
  const hasSubKinds = !!def.subKinds;

  const handleToggle = async (key: string, value: boolean) => {
    updateFeedSettings({ [key]: value });
    if (user) {
      await updateSettings.mutateAsync({ feedSettings: { ...feedSettings, [key]: value } });
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
            {!hasSubKinds && def.feedKey ? (
              <Switch
                checked={feedSettings[def.feedKey]}
                onCheckedChange={(checked) => handleToggle(def.feedKey!, checked)}
              />
            ) : !hasSubKinds && def.feedOnly && def.showKey ? (
              <Switch
                checked={feedSettings[def.showKey] !== false}
                onCheckedChange={(checked) => handleToggle(def.showKey!, checked)}
              />
            ) : null}
          </div>
        </div>
      </div>

      {hasSubKinds && def.subKinds && def.subKinds.map((sub) => (
        <SubKindRow
          key={sub.showKey}
          sub={sub}
        />
      ))}
    </div>
  );
}

function NotesFeedSettings() {
  return (
    <>
      {FEED_KINDS.map((def) => (
        <ContentTypeRow key={def.feedKey ?? String(def.kind)} def={def} />
      ))}
    </>
  );
}

function FeedSettingsFormInternals() {
  return (
    <>
      {SECTION_ORDER.map((section) => {
        const sectionKinds = EXTRA_KINDS.filter((def) => def.section === section);
        if (sectionKinds.length === 0) return null;
        return (
          <div key={section}>
            <div className="px-3 pt-4 pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {SECTION_LABELS[section]}
              </span>
            </div>
            {sectionKinds.map((def) => (
              <ContentTypeRow key={def.feedKey ?? def.showKey ?? String(def.kind)} def={def} />
            ))}
          </div>
        );
      })}
    </>
  );
}

// Feed Tabs Section Component
function FeedTabsSection() {
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const [communityDomain, setCommunityDomain] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [community, setCommunity] = useState<{ domain: string; userCount: number; label: string } | null>(() => {
    const stored = localStorage.getItem('ditto:community');
    return stored ? JSON.parse(stored) : null;
  });

  const [showGlobalFeed, setShowGlobalFeed] = useState(() => {
    const stored = localStorage.getItem('ditto:showGlobalFeed');
    return stored !== null ? stored === 'true' : true; // Default to true
  });

  const [showCommunityFeed, setShowCommunityFeed] = useState(() => {
    const stored = localStorage.getItem('ditto:showCommunityFeed');
    return stored !== null ? stored === 'true' : false; // Default to false
  });

  const handleToggleGlobalFeed = async (checked: boolean) => {
    setShowGlobalFeed(checked);
    localStorage.setItem('ditto:showGlobalFeed', String(checked));
    if (user) {
      await updateSettings.mutateAsync({ showGlobalFeed: checked });
    }
    toast({
      title: checked ? 'Global feed enabled' : 'Global feed disabled',
      description: checked 
        ? 'The Global feed tab will appear in your navigation'
        : 'The Global feed tab will be hidden',
    });
  };

  const handleToggleCommunityFeed = async (checked: boolean) => {
    setShowCommunityFeed(checked);
    localStorage.setItem('ditto:showCommunityFeed', String(checked));
    if (user) {
      await updateSettings.mutateAsync({ showCommunityFeed: checked });
    }
    toast({
      title: checked ? 'Community feed enabled' : 'Community feed disabled',
      description: checked 
        ? 'The Community feed tab will appear in your navigation'
        : 'The Community feed tab will be hidden',
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

      // Extract label from domain (hostname without TLD)
      // ditto.pub -> Ditto, spinster.xyz -> Spinster, etc.
      const domainParts = domain.split('.');
      const hostname = domainParts[0]; // Get first part
      const label = hostname.charAt(0).toUpperCase() + hostname.slice(1); // Capitalize

      // Store in localStorage (single community only)
      const newCommunity = { domain, userCount, label };
      setCommunity(newCommunity);
      localStorage.setItem('ditto:community', JSON.stringify(newCommunity));
      
      // Store the actual JSON data for later use
      localStorage.setItem('ditto:communityData', JSON.stringify(data));

      // Auto-enable the Community feed tab
      setShowCommunityFeed(true);
      localStorage.setItem('ditto:showCommunityFeed', 'true');

      // Sync to encrypted settings
      if (user) {
        await updateSettings.mutateAsync({
          communityData: { domain, label, userCount, nip05: data.names },
          showCommunityFeed: true,
        });
      }

      toast({
        title: 'Community set',
        description: `${label} with ${userCount} users`,
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

  const handleRemoveCommunity = async () => {
    setCommunity(null);
    localStorage.removeItem('ditto:community');
    localStorage.removeItem('ditto:communityData');
    
    // Also disable the community feed tab
    setShowCommunityFeed(false);
    localStorage.setItem('ditto:showCommunityFeed', 'false');

    if (user) {
      await updateSettings.mutateAsync({ communityData: undefined, showCommunityFeed: false });
    }
    
    toast({
      title: 'Community removed',
      description: 'Community feed cleared',
    });
  };

  return (
    <div>
      {/* Intro section for Feed Tabs */}
      <div className="flex items-center gap-4 px-3 pt-3 pb-4">
        <IntroImage src="/community-intro.png" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Feed Navigation</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Manage which feed tabs appear in your navigation and follow communities by domain.
          </p>
        </div>
      </div>

      {/* Feed Tab Toggles */}
      <div className="border-b border-border">
        <div className="flex items-center justify-between py-3.5 px-3">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Show replies in feed</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Include replies from people you follow, not just top-level posts</p>
          </div>
          <Switch
            checked={feedSettings.followsFeedShowReplies}
            onCheckedChange={async (checked) => {
              updateFeedSettings({ followsFeedShowReplies: checked });
              if (user) {
                await updateSettings.mutateAsync({ feedSettings: { ...feedSettings, followsFeedShowReplies: checked } });
              }
              toast({
                title: checked ? 'Replies shown' : 'Replies hidden',
                description: checked
                  ? 'Replies from people you follow will appear in your feed'
                  : 'Only top-level posts will appear in your follows feed',
              });
            }}
            className="shrink-0"
          />
        </div>
      </div>

      <div className="border-b border-border">
        <div className="flex items-center justify-between py-3.5 px-3">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Global Feed</Label>
            <p className="text-xs text-muted-foreground mt-0.5">Show posts from all users across the network</p>
          </div>
          <Switch
            checked={showGlobalFeed}
            onCheckedChange={handleToggleGlobalFeed}
            className="shrink-0"
          />
        </div>
      </div>

      <div className="border-b border-border">
        <div className="flex items-center justify-between py-3.5 px-3">
          <div className="min-w-0">
            <Label className="text-sm font-medium">Community Feed</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              {community 
                ? `Show "${community.label}" tab for ${community.domain} users`
                : 'Set a community below to enable this feed'}
            </p>
          </div>
          <Switch
            checked={showCommunityFeed}
            onCheckedChange={handleToggleCommunityFeed}
            className="shrink-0"
            disabled={!community}
          />
        </div>
      </div>

      <div className="px-3 py-4 space-y-4">

      {/* Community Management */}
      <div className="space-y-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Community</Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Set a community domain. We'll download the NIP-05 user list to show posts only from verified members.
          </p>
        </div>

        {!community ? (
          <div className="flex gap-2">
            <Input
              placeholder="ditto.pub"
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
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{community.label}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {community.domain} • {community.userCount} {community.userCount === 1 ? 'user' : 'users'}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveCommunity}
              className="shrink-0 h-8 w-8 p-0"
            >
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

// Sensitive content settings section
import { useAppContext } from '@/hooks/useAppContext';
import type { ContentWarningPolicy } from '@/contexts/AppContext';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ShieldAlert } from 'lucide-react';

const CW_POLICY_OPTIONS: { value: ContentWarningPolicy; label: string; description: string }[] = [
  {
    value: 'blur',
    label: 'Blur until revealed',
    description: 'Content is hidden behind a warning. Media is not loaded until you choose to view it.',
  },
  {
    value: 'hide',
    label: 'Hide completely',
    description: 'Posts with content warnings are removed from your feed entirely.',
  },
  {
    value: 'show',
    label: 'Always show',
    description: 'Ignore content warnings and display everything normally.',
  },
];

export function SensitiveContentSection() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const handlePolicyChange = async (value: string) => {
    const policy = value as ContentWarningPolicy;
    updateConfig((current) => ({ ...current, contentWarningPolicy: policy }));
    if (user) {
      await updateSettings.mutateAsync({ contentWarningPolicy: policy });
    }
  };

  return (
    <div>
      {/* Intro */}
      <div className="flex items-center gap-4 px-3 pt-3 pb-4">
        <div className="w-40 shrink-0 flex items-center justify-center">
          <ShieldAlert className="size-16 text-muted-foreground/40" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Content Warnings</h3>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            Some posts are tagged with content warnings (NIP-36) by their authors. This can include NSFW material, spoilers, or other sensitive content.
          </p>
        </div>
      </div>

      {/* Policy options — consistent row style with other settings */}
      <RadioGroup
        value={config.contentWarningPolicy}
        onValueChange={handlePolicyChange}
        className="gap-0"
      >
        {CW_POLICY_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-center justify-between py-3.5 px-3 border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/20 transition-colors"
          >
            <div className="min-w-0">
              <span className="text-sm font-medium">{option.label}</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                {option.description}
              </p>
            </div>
            <RadioGroupItem value={option.value} className="shrink-0" />
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

// Mute settings internals (without the intro/image)
import { Trash2, Plus, UserX, Hash, MessageSquareOff, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useMuteList, type MuteListItem } from '@/hooks/useMuteList';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
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

export function MuteSettingsInternals() {
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
      <div className="px-3 py-4 space-y-3 border-b border-border">
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

      {/* Muted items list */}
      {isLoading ? (
        <div className="space-y-2 px-3 py-4">
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

/** Renders a muted user's avatar and display name instead of a raw hex pubkey. */
function MutedUserProfile({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);

  if (author.isLoading) {
    return (
      <div className="flex items-center gap-2.5 min-w-0">
        <Skeleton className="size-7 rounded-full shrink-0" />
        <Skeleton className="h-3.5 w-24" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar className="size-7 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
          {displayName[0]?.toUpperCase() ?? '?'}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm truncate">{displayName}</span>
    </div>
  );
}

/** Renders a muted thread as a clickable link using the nevent identifier. */
function MutedThreadLink({ eventId }: { eventId: string }) {
  const nevent = nip19.neventEncode({ id: eventId });
  const shortId = eventId.slice(0, 8) + '…' + eventId.slice(-8);

  return (
    <Link
      to={`/${nevent}`}
      className="flex items-center gap-1.5 text-xs font-mono text-primary hover:underline truncate"
      onClick={(e) => e.stopPropagation()}
    >
      <ExternalLink className="size-3 shrink-0" />
      <span className="truncate">{shortId}</span>
    </Link>
  );
}

function MuteTypeSection({
  type: _type,
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
      <div className="flex items-center gap-3 px-3 py-3.5">
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
            className="flex items-center justify-between py-2.5 px-3 pl-12 hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {item.type === 'pubkey' ? (
                <MutedUserProfile pubkey={item.value} />
              ) : item.type === 'thread' ? (
                <MutedThreadLink eventId={item.value} />
              ) : (
                <code className="text-xs truncate font-mono bg-muted px-2 py-1 rounded">
                  {item.value}
                </code>
              )}
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

export function ThemePreferencesSection() {
  const { feedSettings, updateFeedSettings } = useFeedSettings();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const showOnProfiles = feedSettings.showCustomProfileThemes !== false;

  const handleProfileThemeToggle = async (value: boolean) => {
    updateFeedSettings({ showCustomProfileThemes: value });
    if (user) {
      const updatedFeedSettings = { ...feedSettings, showCustomProfileThemes: value };
      await updateSettings.mutateAsync({ feedSettings: updatedFeedSettings });
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">Show custom profile themes</Label>
        <p className="text-xs text-muted-foreground">Display other users' custom themes when visiting their profiles</p>
      </div>
      <Switch
        checked={showOnProfiles}
        onCheckedChange={handleProfileThemeToggle}
      />
    </div>
  );
}
