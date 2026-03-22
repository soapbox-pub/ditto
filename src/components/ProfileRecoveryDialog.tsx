import { useState, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { ACTIVE_THEME_KIND, parseActiveProfileTheme } from '@/lib/themeEvent';
import { coreToTokens } from '@/themes';
import { cn } from '@/lib/utils';
import { Check, Loader2, RotateCcw, User, Palette } from 'lucide-react';

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

  return (
    <div
      className={cn(
        'group relative rounded-xl border p-4 transition-all',
        isCurrent
          ? 'border-primary/40 bg-primary/5'
          : 'border-border hover:border-primary/20 hover:bg-secondary/30',
      )}
    >
      {isCurrent && (
        <div className="absolute top-3 right-3 flex items-center gap-1 text-xs font-medium text-primary">
          <Check className="size-3.5" />
          Current
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Avatar */}
        <Avatar className="size-11 shrink-0 rounded-full ring-2 ring-background">
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

      {/* Restore button */}
      {!isCurrent && (
        <div className="mt-3 flex justify-end">
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
        </div>
      )}
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
      {isCurrent && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-1 text-xs font-medium text-primary bg-background/80 backdrop-blur-sm rounded-full px-2 py-0.5">
          <Check className="size-3.5" />
          Current
        </div>
      )}

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

      {/* Info + restore */}
      <div className="px-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{title}</div>
          <div className="text-[11px] text-muted-foreground/70">
            {formatDate(event.created_at)}
          </div>
        </div>

        {!isCurrent && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs rounded-lg gap-1.5 shrink-0"
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
      const events = await nostr.query(
        [{ kinds: [0], authors: [pubkey] }],
        { signal: AbortSignal.timeout(10000) },
      );
      return [...events].sort((a, b) => b.created_at - a.created_at);
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
      const events = await nostr.query(
        [{ kinds: [ACTIVE_THEME_KIND], authors: [pubkey] }],
        { signal: AbortSignal.timeout(10000) },
      );
      return [...events]
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

            <TabsContent value="theme" className="m-0 p-4 space-y-3">
              <ThemeHistoryTab onClose={close} />
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
