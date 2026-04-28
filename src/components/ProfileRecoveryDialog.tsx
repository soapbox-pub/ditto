import { useState, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NostrMetadata } from '@nostrify/nostrify';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { ACTIVE_THEME_KIND, parseActiveProfileTheme } from '@/lib/themeEvent';
import { coreToTokens } from '@/themes';
import { cn } from '@/lib/utils';
import { Check, Loader2, RotateCcw, User, Users, Palette } from 'lucide-react';

/**
 * Query all events matching a filter using `req()` instead of `query()`.
 * This bypasses NSet deduplication in NPool.query(), which discards older
 * versions of replaceable events. We need all historical versions for recovery.
 */
async function queryAllEvents(
  nostr: { req(filters: NostrFilter[], opts?: { signal?: AbortSignal }): AsyncIterable<['EVENT', string, NostrEvent] | ['EOSE', string] | ['CLOSED', string, string]> },
  filters: NostrFilter[],
  signal: AbortSignal,
): Promise<NostrEvent[]> {
  const events: NostrEvent[] = [];
  const seen = new Set<string>();

  for await (const msg of nostr.req(filters, { signal })) {
    if (msg[0] === 'EOSE' || msg[0] === 'CLOSED') break;
    if (msg[0] === 'EVENT') {
      const event = msg[2];
      if (!seen.has(event.id)) {
        seen.add(event.id);
        events.push(event);
      }
    }
  }

  return events;
}

interface ProfileRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Parse kind 0 content into NostrMetadata, returning undefined on failure. */
function parseMetadata(content: string): NostrMetadata | undefined {
  try {
    return JSON.parse(content) as NostrMetadata;
  } catch {
    return undefined;
  }
}

/** Format a unix timestamp into a human-readable date string. */
function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Extracts HSL color string for inline styles. */
function hsl(value: string): string {
  return `hsl(${value})`;
}

// ─── Profile Snapshot Card ────────────────────────────────────────────

function ProfileSnapshotCard({
  event,
  isCurrent,
  onRestore,
  isRestoring,
}: {
  event: NostrEvent;
  isCurrent: boolean;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  const metadata = useMemo(() => parseMetadata(event.content), [event.content]);
  const displayName = metadata?.display_name || metadata?.name || genUserName(event.pubkey);
  const avatarShape = getAvatarShape(metadata);

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all',
        isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-primary/20 hover:bg-secondary/30',
      )}
    >
      {/* Top-right action: "Current" badge or "Restore" button */}
      <div className="absolute top-3 right-3">
        {isCurrent ? (
          <div className="flex items-center gap-1 text-xs font-medium text-primary">
            <Check className="size-3.5" />
            Current
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs rounded-lg gap-1.5"
            onClick={onRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Restore
          </Button>
        )}
      </div>

      <div className="flex items-start gap-3 pr-24">
        {/* Avatar */}
        <Avatar shape={avatarShape} className="size-11 shrink-0 ring-2 ring-background">
          {metadata?.picture ? (
            <AvatarImage src={metadata.picture} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="font-semibold text-sm truncate">{displayName}</div>
          {metadata?.nip05 && (
            <div className="text-xs text-muted-foreground truncate">{metadata.nip05}</div>
          )}
          {metadata?.about && (
            <div className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{metadata.about}</div>
          )}
          <div className="text-[11px] text-muted-foreground/70 pt-0.5">
            {formatDate(event.created_at)}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Theme Snapshot Card ──────────────────────────────────────────────

function ThemeSnapshotCard({
  event,
  isCurrent,
  onRestore,
  isRestoring,
}: {
  event: NostrEvent;
  isCurrent: boolean;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  const parsed = useMemo(() => parseActiveProfileTheme(event), [event]);
  const title = event.tags.find(([n]) => n === 'title')?.[1] ?? 'Profile Theme';
  const tokens = useMemo(() => (parsed ? coreToTokens(parsed.colors) : null), [parsed]);

  if (!parsed || !tokens) {
    return null;
  }

  return (
    <div
      className={cn(
        'group relative rounded-xl border overflow-hidden transition-all',
        isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-primary/20',
      )}
    >
      {/* Top-right action: "Current" badge or "Restore" button.
          Floats over the theme mockup — use backdrop-blur to stay legible on any theme. */}
      <div className="absolute top-3 right-3 z-10">
        {isCurrent ? (
          <div className="flex items-center gap-1 text-xs font-medium text-primary bg-background/80 backdrop-blur-sm rounded-full px-2 py-0.5">
            <Check className="size-3.5" />
            Current
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs rounded-lg gap-1.5 bg-background/80 backdrop-blur-sm"
            onClick={onRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Restore
          </Button>
        )}
      </div>

      {/* Theme mini-mockup */}
      <div
        className="aspect-[3/1] relative"
        style={{ backgroundColor: hsl(tokens.background) }}
      >
        {parsed.background?.url && (
          <img
            src={parsed.background.url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        <div className="p-4 space-y-2 relative">
          <div
            className="h-2.5 w-3/4 rounded-full"
            style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.5 }}
          />
          <div
            className="h-2.5 w-1/2 rounded-full"
            style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.35 }}
          />
          <div
            className="h-5 w-20 rounded"
            style={{ backgroundColor: hsl(tokens.primary) }}
          />
        </div>
      </div>

      {/* Info */}
      <div className="px-4 py-3 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-[11px] text-muted-foreground/70">
          {formatDate(event.created_at)}
        </div>
      </div>
    </div>
  );
}

// ─── Follows Snapshot Card ─────────────────────────────────────────────

function FollowsSnapshotCard({
  event,
  isCurrent,
  onRestore,
  isRestoring,
}: {
  event: NostrEvent;
  isCurrent: boolean;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  // Reverse so newest follows (appended to the end of the tag list) appear first.
  const followedPubkeys = useMemo(
    () =>
      event.tags
        .filter(([name, value]) => name === 'p' && typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))
        .map(([, value]) => value)
        .reverse(),
    [event.tags],
  );
  const followCount = followedPubkeys.length;

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all',
        isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-primary/20 hover:bg-secondary/30',
      )}
    >
      {/* Top-right action: "Current" badge or "Restore" button */}
      <div className="absolute top-3 right-3">
        {isCurrent ? (
          <div className="flex items-center gap-1 text-xs font-medium text-primary">
            <Check className="size-3.5" />
            Current
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs rounded-lg gap-1.5"
            onClick={onRestore}
            disabled={isRestoring}
          >
            {isRestoring ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Restore
          </Button>
        )}
      </div>

      {followCount > 0 ? (
        <div className="pr-24">
          <PeopleAvatarStack pubkeys={followedPubkeys} maxVisible={8} size="md" />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground pr-24">No follows</div>
      )}

      <div className="text-[11px] text-muted-foreground/70 mt-2">
        {formatDate(event.created_at)}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────

function SnapshotSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Skeleton className="size-11 rounded-full shrink-0" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Profile History Tab ──────────────────────────────────────────────

function ProfileHistoryTab({ onClose }: { onClose: () => void }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const pubkey = user?.pubkey;

  const profileHistory = useQuery<NostrEvent[]>({
    queryKey: ['profile-recovery', 'kind0', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];
      const events = await queryAllEvents(
        nostr,
        [{ kinds: [0], authors: [pubkey] }],
        AbortSignal.timeout(10000),
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
  });

  const profileEvents = profileHistory.data ?? [];
  const currentProfileId = profileEvents[0]?.id;

  const handleRestore = async (event: NostrEvent) => {
    setRestoringId(event.id);
    try {
      await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      toast({
        title: 'Profile restored',
        description: `Successfully restored from ${formatDate(event.created_at)}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['profile-recovery', 'kind0', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['author', pubkey] });

      onClose();
    } catch (error) {
      console.error('Failed to restore event:', error);
      toast({
        title: 'Restore failed',
        description: 'Could not republish the event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (profileHistory.isLoading) {
    return <SnapshotSkeleton />;
  }

  if (profileEvents.length === 0) {
    return <EmptyState label="No profile history found. Your relay may not store historical events." />;
  }

  return (
    <>
      {profileEvents.map((event) => (
        <ProfileSnapshotCard
          key={event.id}
          event={event}
          isCurrent={event.id === currentProfileId}
          onRestore={() => handleRestore(event)}
          isRestoring={restoringId === event.id}
        />
      ))}
    </>
  );
}

// ─── Theme History Tab ────────────────────────────────────────────────

function ThemeHistoryTab({ onClose }: { onClose: () => void }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const pubkey = user?.pubkey;

  const themeHistory = useQuery<NostrEvent[]>({
    queryKey: ['profile-recovery', 'kind16767', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];
      const events = await queryAllEvents(
        nostr,
        [{ kinds: [ACTIVE_THEME_KIND], authors: [pubkey] }],
        AbortSignal.timeout(10000),
      );
      return events
        .sort((a, b) => b.created_at - a.created_at)
        .filter((e) => parseActiveProfileTheme(e) !== null);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
  });

  const themeEvents = themeHistory.data ?? [];
  const currentThemeId = themeEvents[0]?.id;

  const handleRestore = async (event: NostrEvent) => {
    setRestoringId(event.id);
    try {
      await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      toast({
        title: 'Theme restored',
        description: `Successfully restored from ${formatDate(event.created_at)}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['profile-recovery', 'kind16767', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['activeProfileTheme', pubkey] });

      onClose();
    } catch (error) {
      console.error('Failed to restore event:', error);
      toast({
        title: 'Restore failed',
        description: 'Could not republish the event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (themeHistory.isLoading) {
    return <SnapshotSkeleton />;
  }

  if (themeEvents.length === 0) {
    return <EmptyState label="No theme history found. Your relay may not store historical events." />;
  }

  return (
    <>
      {themeEvents.map((event) => (
        <ThemeSnapshotCard
          key={event.id}
          event={event}
          isCurrent={event.id === currentThemeId}
          onRestore={() => handleRestore(event)}
          isRestoring={restoringId === event.id}
        />
      ))}
    </>
  );
}

// ─── Follows History Tab ──────────────────────────────────────────────

function FollowsHistoryTab({ onClose }: { onClose: () => void }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const pubkey = user?.pubkey;

  const followsHistory = useQuery<NostrEvent[]>({
    queryKey: ['profile-recovery', 'kind3', pubkey],
    queryFn: async () => {
      if (!pubkey) return [];
      const events = await queryAllEvents(
        nostr,
        [{ kinds: [3], authors: [pubkey] }],
        AbortSignal.timeout(10000),
      );
      return events.sort((a, b) => b.created_at - a.created_at);
    },
    enabled: !!pubkey,
    staleTime: 30_000,
  });

  const followsEvents = followsHistory.data ?? [];
  const currentFollowsId = followsEvents[0]?.id;

  const handleRestore = async (event: NostrEvent) => {
    setRestoringId(event.id);
    try {
      await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      toast({
        title: 'Follow list restored',
        description: `Successfully restored from ${formatDate(event.created_at)}.`,
      });

      queryClient.invalidateQueries({ queryKey: ['profile-recovery', 'kind3', pubkey] });
      queryClient.invalidateQueries({ queryKey: ['follow-list'] });

      onClose();
    } catch (error) {
      console.error('Failed to restore event:', error);
      toast({
        title: 'Restore failed',
        description: 'Could not republish the event. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (followsHistory.isLoading) {
    return <SnapshotSkeleton />;
  }

  if (followsEvents.length === 0) {
    return <EmptyState label="No follow list history found. Your relay may not store historical events." />;
  }

  return (
    <>
      {followsEvents.map((event) => (
        <FollowsSnapshotCard
          key={event.id}
          event={event}
          isCurrent={event.id === currentFollowsId}
          onRestore={() => handleRestore(event)}
          isRestoring={restoringId === event.id}
        />
      ))}
    </>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────

export function ProfileRecoveryDialog({ open, onOpenChange }: ProfileRecoveryDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-lg font-bold">Profile Recovery</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="profile" className="w-full">
          <div className="px-6">
            <TabsList className="w-full">
              <TabsTrigger value="profile" className="flex-1 gap-1.5">
                <User className="size-3.5" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="follows" className="flex-1 gap-1.5">
                <Users className="size-3.5" />
                Follows
              </TabsTrigger>
              <TabsTrigger value="theme" className="flex-1 gap-1.5">
                <Palette className="size-3.5" />
                Theme
              </TabsTrigger>
            </TabsList>
          </div>

          <Separator className="mt-3" />

          <ScrollArea className="h-[420px]">
            <TabsContent value="profile" className="m-0 p-4 space-y-3">
              <ProfileHistoryTab onClose={close} />
            </TabsContent>

            <TabsContent value="follows" className="m-0 p-4 space-y-3">
              <FollowsHistoryTab onClose={close} />
            </TabsContent>

            <TabsContent value="theme" className="m-0 p-4 space-y-3">
              <ThemeHistoryTab onClose={close} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
