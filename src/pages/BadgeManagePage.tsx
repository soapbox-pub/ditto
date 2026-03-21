import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Award, ChevronUp, ChevronDown, X, Check, Clock, Loader2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { BadgeTierPill } from '@/components/BadgeTierPill';
import { LoginArea } from '@/components/auth/LoginArea';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileBadges } from '@/hooks/useProfileBadges';
import { useBadgeDefinitions, type BadgeDefinition } from '@/hooks/useBadgeDefinitions';
import { usePendingBadges, type PendingBadge } from '@/hooks/usePendingBadges';
import { useAcceptBadge } from '@/hooks/useAcceptBadge';
import { useRemoveBadge } from '@/hooks/useRemoveBadge';
import { useReorderBadges } from '@/hooks/useReorderBadges';
import { useAuthor } from '@/hooks/useAuthor';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { getBadgeTier } from '@/lib/badgeUtils';
import { cn } from '@/lib/utils';

export function BadgeManagePage() {
  const { config } = useAppContext();

  useSeoMeta({
    title: `My Badges | ${config.appName}`,
    description: 'Manage your accepted and pending Nostr badges.',
  });

  const { user } = useCurrentUser();
  const { refs, isLoading: isLoadingRefs } = useProfileBadges(user?.pubkey);
  const { badgeMap, isLoading: isLoadingDefs } = useBadgeDefinitions(refs);
  const { pendingBadges, count: pendingCount, isLoading: isLoadingPending } = usePendingBadges(user?.pubkey);

  // Fetch definitions for pending badges too
  const pendingRefs = pendingBadges.map((p) => ({ pubkey: p.issuerPubkey, identifier: p.identifier }));
  const { badgeMap: pendingBadgeMap, isLoading: isLoadingPendingDefs } = useBadgeDefinitions(pendingRefs);

  // Optimistic local ordering state
  const [localRefs, setLocalRefs] = useState(refs);
  useEffect(() => {
    setLocalRefs(refs);
  }, [refs]);

  const acceptedCount = localRefs.length;
  const isLoading = isLoadingRefs || isLoadingDefs;

  return (
    <main>
      {/* Sticky header */}
      <div className={cn('sidebar:sticky sidebar:top-0', 'flex items-center gap-4 px-4 pt-4 pb-5 bg-background/80 backdrop-blur-md z-10')}>
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2">
          <Award className="size-5" />
          <h1 className="text-xl font-bold">My Badges</h1>
        </div>
      </div>

      {/* Content */}
      {!user ? (
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Award className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-bold">Manage your badges</h2>
            <p className="text-muted-foreground text-sm">
              Log in to view, accept, and organize your Nostr badges.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      ) : (
        <div className="px-4 pb-8">
          <Tabs defaultValue="accepted">
            <TabsList className="w-full mb-4">
              <TabsTrigger value="accepted" className="flex-1 gap-2">
                Accepted
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {isLoading ? '…' : acceptedCount}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="pending" className="flex-1 gap-2">
                Pending
                <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                  {isLoadingPending ? '…' : pendingCount}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="accepted">
              <AcceptedTab
                refs={localRefs}
                setRefs={setLocalRefs}
                badgeMap={badgeMap}
                isLoading={isLoading}
              />
            </TabsContent>

            <TabsContent value="pending">
              <PendingTab
                pendingBadges={pendingBadges}
                badgeMap={pendingBadgeMap}
                isLoading={isLoadingPending || isLoadingPendingDefs}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </main>
  );
}

// ---------------------------------------------------------------------------
// Accepted Tab
// ---------------------------------------------------------------------------

interface AcceptedRef {
  aTag: string;
  eTag?: string;
  kind: number;
  pubkey: string;
  identifier: string;
}

interface AcceptedTabProps {
  refs: AcceptedRef[];
  setRefs: React.Dispatch<React.SetStateAction<AcceptedRef[]>>;
  badgeMap: Map<string, BadgeDefinition>;
  isLoading: boolean;
}

function AcceptedTab({ refs, setRefs, badgeMap, isLoading }: AcceptedTabProps) {
  const { toast } = useToast();
  const { mutate: reorderBadges, isPending: isReordering } = useReorderBadges();
  const { mutate: removeBadge } = useRemoveBadge();

  const moveUp = useCallback((index: number) => {
    if (index <= 0) return;
    setRefs((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      reorderBadges(next.map((r) => ({ aTag: r.aTag, eTag: r.eTag })), {
        onError: () => toast({ title: 'Failed to reorder badges', variant: 'destructive' }),
      });
      return next;
    });
  }, [setRefs, reorderBadges, toast]);

  const moveDown = useCallback((index: number) => {
    setRefs((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      reorderBadges(next.map((r) => ({ aTag: r.aTag, eTag: r.eTag })), {
        onError: () => toast({ title: 'Failed to reorder badges', variant: 'destructive' }),
      });
      return next;
    });
  }, [setRefs, reorderBadges, toast]);

  const handleRemove = useCallback((aTag: string) => {
    setRefs((prev) => prev.filter((r) => r.aTag !== aTag));
    removeBadge(aTag, {
      onError: () => toast({ title: 'Failed to remove badge', variant: 'destructive' }),
    });
  }, [setRefs, removeBadge, toast]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <AcceptedBadgeSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (refs.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-muted">
          <Award className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h3 className="text-lg font-semibold">No accepted badges</h3>
          <p className="text-muted-foreground text-sm">
            When you accept a badge, it will appear here. Check the Pending tab for badges waiting for your approval.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5 relative">
      {isReordering && (
        <div className="absolute inset-0 bg-background/40 backdrop-blur-[1px] z-10 flex items-center justify-center rounded-xl pointer-events-none">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      )}
      {refs.map((ref, index) => (
        <AcceptedBadgeRow
          key={ref.aTag}
          ref_={ref}
          index={index}
          total={refs.length}
          badge={badgeMap.get(ref.aTag)}
          onMoveUp={() => moveUp(index)}
          onMoveDown={() => moveDown(index)}
          onRemove={() => handleRemove(ref.aTag)}
        />
      ))}
    </div>
  );
}

interface AcceptedBadgeRowProps {
  ref_: AcceptedRef;
  index: number;
  total: number;
  badge: BadgeDefinition | undefined;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function AcceptedBadgeRow({ ref_, index, total, badge, onMoveUp, onMoveDown, onRemove }: AcceptedBadgeRowProps) {
  const tier = badge?.event ? getBadgeTier(badge.event) : undefined;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors group">
      {/* Position number */}
      <span className="text-xs font-mono text-muted-foreground w-5 text-center shrink-0">
        {index + 1}
      </span>

      {/* Badge thumbnail */}
      {badge ? (
        <BadgeThumbnail badge={badge} size={40} className="shrink-0" />
      ) : (
        <Skeleton className="size-10 rounded-lg shrink-0" />
      )}

      {/* Badge info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {badge?.name ?? ref_.identifier}
          </span>
          {tier && <BadgeTierPill tier={tier} />}
        </div>
        <IssuerName pubkey={ref_.pubkey} />
      </div>

      {/* Reorder controls */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onMoveUp}
          disabled={index === 0}
          aria-label="Move up"
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onMoveDown}
          disabled={index === total - 1}
          aria-label="Move down"
        >
          <ChevronDown className="size-4" />
        </Button>
      </div>

      {/* Remove button */}
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all shrink-0"
        onClick={onRemove}
        aria-label="Remove badge"
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}

function AcceptedBadgeSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
      <Skeleton className="size-5 rounded shrink-0" />
      <Skeleton className="size-10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pending Tab
// ---------------------------------------------------------------------------

interface PendingTabProps {
  pendingBadges: PendingBadge[];
  badgeMap: Map<string, BadgeDefinition>;
  isLoading: boolean;
}

function PendingTab({ pendingBadges, badgeMap, isLoading }: PendingTabProps) {
  const [dismissedATags, setDismissedATags] = useState<Set<string>>(new Set());

  const visibleBadges = pendingBadges.filter((p) => !dismissedATags.has(p.aTag));

  const handleDismiss = useCallback((aTag: string) => {
    setDismissedATags((prev) => new Set(prev).add(aTag));
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <PendingBadgeSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (visibleBadges.length === 0) {
    return (
      <div className="py-16 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-muted">
          <Clock className="size-8 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-xs">
          <h3 className="text-lg font-semibold">No pending badges</h3>
          <p className="text-muted-foreground text-sm">
            When someone awards you a badge, it will appear here for you to accept or dismiss.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {visibleBadges.map((pending) => (
        <PendingBadgeRow
          key={pending.aTag}
          pending={pending}
          badge={badgeMap.get(pending.aTag)}
          onDismiss={() => handleDismiss(pending.aTag)}
        />
      ))}
    </div>
  );
}

interface PendingBadgeRowProps {
  pending: PendingBadge;
  badge: BadgeDefinition | undefined;
  onDismiss: () => void;
}

function PendingBadgeRow({ pending, badge, onDismiss }: PendingBadgeRowProps) {
  const { toast } = useToast();
  const { mutate: acceptBadge, isPending: isAccepting } = useAcceptBadge();
  const tier = badge?.event ? getBadgeTier(badge.event) : undefined;

  const handleAccept = () => {
    acceptBadge(
      { aTag: pending.aTag, awardEventId: pending.awardEvent.id },
      {
        onSuccess: () => toast({ title: 'Badge accepted!' }),
        onError: () => toast({ title: 'Failed to accept badge', variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card animate-pending-glow transition-colors">
      {/* Badge thumbnail */}
      {badge ? (
        <BadgeThumbnail badge={badge} size={40} className="shrink-0" />
      ) : (
        <Skeleton className="size-10 rounded-lg shrink-0" />
      )}

      {/* Badge info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {badge?.name ?? pending.identifier}
          </span>
          {tier && <BadgeTierPill tier={tier} />}
        </div>
        <div className="flex items-center gap-2">
          <IssuerName pubkey={pending.issuerPubkey} />
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs text-muted-foreground">{timeAgo(pending.awardedAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          variant="default"
          className="h-8 gap-1.5"
          onClick={handleAccept}
          disabled={isAccepting}
        >
          {isAccepting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 text-muted-foreground"
          onClick={onDismiss}
          disabled={isAccepting}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

function PendingBadgeSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border">
      <Skeleton className="size-10 rounded-lg shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Tiny inline issuer name resolved from pubkey. */
function IssuerName({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name ?? genUserName(pubkey);

  return (
    <span className="text-xs text-muted-foreground truncate">
      by {name}
    </span>
  );
}
