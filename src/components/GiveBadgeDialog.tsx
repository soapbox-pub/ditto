import { useMemo } from 'react';
import { Award, Loader2, Check } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { parseBadgeDefinition } from '@/components/BadgeContent';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAwardBadge } from '@/hooks/useAwardBadge';
import { useToast } from '@/hooks/useToast';
import { BADGE_DEFINITION_KIND, getBadgeATag } from '@/lib/badgeUtils';
import type { NostrEvent } from '@nostrify/nostrify';

interface GiveBadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pubkey of the user to give a badge to. */
  recipientPubkey: string;
  /** Recipient display name for UI text. */
  recipientName: string;
}

interface ParsedBadge {
  event: NostrEvent;
  badge: NonNullable<ReturnType<typeof parseBadgeDefinition>>;
  aTag: string;
}

export function GiveBadgeDialog({ open, onOpenChange, recipientPubkey, recipientName }: GiveBadgeDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const { mutateAsync: awardBadge, isPending: isAwarding, variables: awardingVars } = useAwardBadge();

  // Fetch the current user's created badges
  const { data: rawCreatedEvents, isLoading } = useQuery({
    queryKey: ['my-created-badges', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      return nostr.query(
        [{ kinds: [BADGE_DEFINITION_KIND], authors: [user.pubkey], limit: 200 }],
        { signal },
      );
    },
    enabled: !!user && open,
    staleTime: 60_000,
  });

  const createdBadges = useMemo(() => {
    if (!rawCreatedEvents) return [];
    const parsed: ParsedBadge[] = [];
    for (const event of rawCreatedEvents) {
      const badge = parseBadgeDefinition(event);
      if (!badge) continue;
      parsed.push({ event, badge, aTag: getBadgeATag(event) });
    }
    return parsed.sort((a, b) => b.event.created_at - a.event.created_at);
  }, [rawCreatedEvents]);

  const handleAward = async (item: ParsedBadge) => {
    try {
      await awardBadge({
        aTag: item.aTag,
        recipientPubkeys: [recipientPubkey],
      });
      toast({
        title: 'Badge awarded!',
        description: `"${item.badge.name}" awarded to ${recipientName}.`,
      });
      onOpenChange(false);
    } catch {
      toast({ title: 'Failed to award badge', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Award className="size-5 text-primary" />
            Give Badge
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Select a badge to give to <span className="font-medium text-foreground">{recipientName}</span>.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="border-t border-border" style={{ height: 340 }}>
          {isLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-12 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : createdBadges.length > 0 ? (
            <div className="divide-y divide-border">
              {createdBadges.map((item) => {
                const isThisAwarding = isAwarding && awardingVars?.aTag === item.aTag;
                return (
                  <button
                    key={item.aTag}
                    type="button"
                    onClick={() => handleAward(item)}
                    disabled={isAwarding}
                    className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-secondary/30 transition-colors disabled:opacity-50"
                  >
                    <BadgeThumbnail badge={item.badge} size={48} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-semibold text-sm block truncate">{item.badge.name}</span>
                      {item.badge.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.badge.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 ml-auto">
                      {isThisAwarding ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <Check className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100" />
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
              <Award className="size-8 mb-2 opacity-30" />
              <p>You haven't created any badges yet.</p>
              <p className="text-xs mt-1">Create badges on the <a href="/badges" className="text-primary hover:underline">Badges page</a>.</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
