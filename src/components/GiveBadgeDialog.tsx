import { useMemo, useState, useCallback } from 'react';
import { Award, Loader2, Check, AlertCircle } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import { FormattedMessage, useIntl } from 'react-intl';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { parseBadgeDefinition } from '@/lib/parseBadgeDefinition';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAwardBadge } from '@/hooks/useAwardBadge';
import { useToast } from '@/hooks/useToast';
import { BADGE_DEFINITION_KIND, BADGE_AWARD_KIND, getBadgeATag } from '@/lib/badgeUtils';
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
  const intl = useIntl();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { toast } = useToast();
  const { mutateAsync: awardBadge } = useAwardBadge();

  const [selectedATags, setSelectedATags] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  // Fetch the current user's created badges
  const { data: rawCreatedEvents, isLoading: isLoadingBadges } = useQuery({
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

  // Fetch existing awards from the current user to this recipient
  const { data: existingAwards, isLoading: isLoadingAwards } = useQuery({
    queryKey: ['badge-awards-from-to', user?.pubkey ?? '', recipientPubkey],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      return nostr.query(
        [{ kinds: [BADGE_AWARD_KIND], authors: [user.pubkey], '#p': [recipientPubkey], limit: 500 }],
        { signal },
      );
    },
    enabled: !!user && open,
    staleTime: 30_000,
  });

  // Build a set of badge aTags already awarded to this recipient by the current user
  const alreadyAwardedATags = useMemo(() => {
    const set = new Set<string>();
    if (!existingAwards) return set;
    for (const event of existingAwards) {
      const aTag = event.tags.find(([n]) => n === 'a')?.[1];
      if (aTag) set.add(aTag);
    }
    return set;
  }, [existingAwards]);

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

  const isLoading = isLoadingBadges || isLoadingAwards;

  const toggleSelection = useCallback((aTag: string) => {
    setSelectedATags((prev) => {
      const next = new Set(prev);
      if (next.has(aTag)) {
        next.delete(aTag);
      } else {
        next.add(aTag);
      }
      return next;
    });
  }, []);

  const handleSend = async () => {
    if (selectedATags.size === 0) return;
    setIsSending(true);

    const toAward = createdBadges.filter((item) => selectedATags.has(item.aTag));
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const item of toAward) {
      try {
        await awardBadge({
          aTag: item.aTag,
          recipientPubkeys: [recipientPubkey],
        });
        succeeded.push(item.badge.name);
      } catch {
        failed.push(item.badge.name);
      }
    }

    if (succeeded.length > 0) {
      toast({
        title: intl.formatMessage({ id: 'giveBadge.awarded.title', defaultMessage: 'Badges awarded!' }),
        description: succeeded.length <= 3
          ? intl.formatMessage(
            { id: 'giveBadge.awarded.names', defaultMessage: '{names} awarded to {name}.' },
            { names: succeeded.map((n) => `"${n}"`).join(', '), name: recipientName },
          )
          : intl.formatMessage(
            { id: 'giveBadge.awarded.count', defaultMessage: '{count} badges awarded to {name}.' },
            { count: succeeded.length, name: recipientName },
          ),
      });
    }

    if (failed.length > 0) {
      toast({
        title: intl.formatMessage(
          { id: 'giveBadge.failed.title', defaultMessage: '{count, plural, one {Failed to award # badge} other {Failed to award # badges}}' },
          { count: failed.length },
        ),
        description: intl.formatMessage({ id: 'giveBadge.failed.description', defaultMessage: 'Please try again.' }),
        variant: 'destructive',
      });
    }

    setSelectedATags(new Set());
    setIsSending(false);
    if (failed.length === 0) {
      onOpenChange(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSelectedATags(new Set());
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Award className="size-5 text-primary" />
            <FormattedMessage id="giveBadge.title" defaultMessage="Award Badges" />
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <FormattedMessage
              id="giveBadge.description"
              defaultMessage="Select badges to award to <b>{name}</b>."
              values={{
                name: recipientName,
                b: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
              }}
            />
          </DialogDescription>
        </DialogHeader>

        <ScrollArea style={{ height: 340 }}>
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
            <div>
              {createdBadges.map((item) => {
                const isAlreadySent = alreadyAwardedATags.has(item.aTag);
                const isSelected = selectedATags.has(item.aTag);

                return (
                  <button
                    key={item.aTag}
                    type="button"
                    onClick={() => !isAlreadySent && toggleSelection(item.aTag)}
                    disabled={isSending || isAlreadySent}
                    className="group flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-secondary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => !isAlreadySent && toggleSelection(item.aTag)}
                      disabled={isSending || isAlreadySent}
                      className="shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <BadgeThumbnail badge={item.badge} size={48} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm block truncate">{item.badge.name}</span>
                        {isAlreadySent && (
                          <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0 h-4 gap-1 text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600">
                            <AlertCircle className="size-2.5" />
                            <FormattedMessage id="giveBadge.alreadySent" defaultMessage="Already sent" />
                          </Badge>
                        )}
                      </div>
                      {item.badge.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.badge.description}</p>
                      )}
                    </div>
                    <span className="shrink-0 ml-auto">
                      {isSelected ? (
                        <Check className="size-4 text-primary" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
              <Award className="size-8 mb-2 opacity-30" />
              <p>
                <FormattedMessage id="giveBadge.empty" defaultMessage="You haven't created any badges yet." />
              </p>
              <p className="text-xs mt-1">
                <FormattedMessage
                  id="giveBadge.emptyHint"
                  defaultMessage="Create badges on the <a>Badges page</a>."
                  values={{ a: (chunks) => <a href="/badges" className="text-primary hover:underline">{chunks}</a> }}
                />
              </p>
            </div>
          )}
        </ScrollArea>

        {createdBadges.length > 0 && (
          <DialogFooter className="px-4 py-3">
            <Button
              onClick={handleSend}
              disabled={selectedATags.size === 0 || isSending}
              className="w-full gap-2"
            >
              {isSending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  <FormattedMessage id="giveBadge.awarding" defaultMessage="Awarding..." />
                </>
              ) : (
                <>
                  <Award className="size-4" />
                  {selectedATags.size > 0 ? (
                    <FormattedMessage
                      id="giveBadge.awardCount"
                      defaultMessage="{count, plural, one {Award # badge} other {Award # badges}}"
                      values={{ count: selectedATags.size }}
                    />
                  ) : (
                    <FormattedMessage id="giveBadge.awardNone" defaultMessage="Award badges" />
                  )}
                </>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
