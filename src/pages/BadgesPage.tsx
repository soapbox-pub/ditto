import type { NostrEvent } from "@nostrify/nostrify";
import { useNostr } from "@nostrify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSeoMeta } from "@unhead/react";
import {
  Award,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Loader2,
  Pencil,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { nip19 } from "nostr-tools";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";
import { Link } from "react-router-dom";
import { AwardBadgeDialog } from "@/components/AwardBadgeDialog";
import { LoginArea } from "@/components/auth/LoginArea";
import {
  type BadgeData,
  parseBadgeDefinition,
} from "@/components/BadgeContent";
import { BadgeThumbnail } from "@/components/BadgeThumbnail";
import { CreateBadgeDialog } from "@/components/CreateBadgeDialog";
import { FeedEmptyState } from "@/components/FeedEmptyState";
import { NoteCard } from "@/components/NoteCard";
import { PageHeader } from "@/components/PageHeader";
import { PullToRefresh } from "@/components/PullToRefresh";
import { SubHeaderBar } from "@/components/SubHeaderBar";
import { TabButton } from "@/components/TabButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useLayoutOptions } from "@/contexts/LayoutContext";
import { useAcceptBadge } from "@/hooks/useAcceptBadge";
import { useAppContext } from "@/hooks/useAppContext";
import { useAuthor } from "@/hooks/useAuthor";
import {
  type BadgeDefinition,
  useBadgeDefinitions,
} from "@/hooks/useBadgeDefinitions";
import { useBadgeFeed } from "@/hooks/useBadgeFeed";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { type PendingBadge, usePendingBadges } from "@/hooks/usePendingBadges";
import { useProfileBadges } from "@/hooks/useProfileBadges";
import { useRemoveBadge } from "@/hooks/useRemoveBadge";
import { useReorderBadges } from "@/hooks/useReorderBadges";
import { useToast } from "@/hooks/useToast";
import { useUploadFile } from "@/hooks/useUploadFile";
import { BADGE_DEFINITION_KIND, getBadgeATag } from "@/lib/badgeUtils";
import { genUserName } from "@/lib/genUserName";
import { timeAgo } from "@/lib/timeAgo";

// ─── Types ─────────────────────────────────────────────────────────────────────

type BadgesTab = "mine" | "follows";

interface ParsedBadge {
  event: NostrEvent;
  badge: BadgeData;
  aTag: string;
}

// ─── NoteCard Skeleton ─────────────────────────────────────────────────────────

function NoteCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="min-w-0 space-y-1.5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
      <div className="flex items-center gap-6 mt-3 -ml-2">
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
        <Skeleton className="h-4 w-8" />
      </div>
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function BadgesPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Fetch pending badges at page level so we can show a counter on the tab
  const {
    pendingBadges,
    count: pendingCount,
    isLoading: isLoadingPending,
  } = usePendingBadges(user?.pubkey);

  useLayoutOptions({
    showFAB: true,
    onFabClick: () => setCreateDialogOpen(true),
    fabIcon: <Award className="size-5" />,
    hasSubHeader: !!user,
  });

  const [activeTab, setActiveTab] = useState<BadgesTab>(() => {
    try {
      const stored = sessionStorage.getItem("ditto:feed-tab:badges");
      if (stored === "mine" || stored === "follows") return stored;
    } catch {
      /* ignore */
    }
    return "follows";
  });

  const handleSetTab = useCallback((tab: BadgesTab) => {
    setActiveTab(tab);
    try {
      sessionStorage.setItem("ditto:feed-tab:badges", tab);
    } catch {
      /* ignore */
    }
  }, []);

  useSeoMeta({
    title: `Badges | ${config.appName}`,
    description:
      "Discover badges, create new ones, and show them off on your profile",
  });

  return (
    <main className="pb-16 sidebar:pb-0">
      <PageHeader title="Badges" icon={<Award className="size-5" />} />

      {/* Follows / My Badges tabs */}
      {user && (
        <SubHeaderBar>
          <TabButton
            label="Follows"
            active={activeTab === "follows"}
            onClick={() => handleSetTab("follows")}
          />
          <TabButton
            label="My Badges"
            active={activeTab === "mine"}
            onClick={() => handleSetTab("mine")}
          >
            <span className="inline-flex items-center gap-1.5">
              My Badges
              {pendingCount > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold leading-none">
                  {pendingCount}
                </span>
              )}
            </span>
          </TabButton>
        </SubHeaderBar>
      )}

      {/* Tab content */}
      {activeTab === "mine" ? (
        <MyBadgesTab
          onOpenCreate={() => setCreateDialogOpen(true)}
          pendingBadges={pendingBadges}
          pendingCount={pendingCount}
          isLoadingPending={isLoadingPending}
        />
      ) : (
        <FollowsFeedTab
          onRefresh={() =>
            queryClient.invalidateQueries({
              queryKey: ["badge-feed", "follows"],
            })
          }
        />
      )}

      <CreateBadgeDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
    </main>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// My Badges Tab
// ═══════════════════════════════════════════════════════════════════════════════

interface MyBadgesTabProps {
  onOpenCreate: () => void;
  pendingBadges: PendingBadge[];
  pendingCount: number;
  isLoadingPending: boolean;
}

function MyBadgesTab({
  onOpenCreate,
  pendingBadges,
  pendingCount,
  isLoadingPending,
}: MyBadgesTabProps) {
  const { user } = useCurrentUser();

  if (!user) {
    return (
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
    );
  }

  return (
    <MyBadgesContent
      onOpenCreate={onOpenCreate}
      pendingBadges={pendingBadges}
      pendingCount={pendingCount}
      isLoadingPending={isLoadingPending}
    />
  );
}

function MyBadgesContent({
  onOpenCreate,
  pendingBadges,
  pendingCount,
  isLoadingPending,
}: MyBadgesTabProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();

  // Accepted badges
  const { refs, isLoading: isLoadingRefs } = useProfileBadges(user?.pubkey);
  const { badgeMap, isLoading: isLoadingDefs } = useBadgeDefinitions(refs);

  // Pending badges (data passed down from parent to share with tab counter)
  const pendingRefs = useMemo(
    () =>
      pendingBadges.map((p) => ({
        pubkey: p.issuerPubkey,
        identifier: p.identifier,
      })),
    [pendingBadges],
  );
  const { badgeMap: pendingBadgeMap, isLoading: isLoadingPendingDefs } =
    useBadgeDefinitions(pendingRefs);

  // Created badges
  const { data: rawCreatedEvents, isLoading: isLoadingCreated } = useQuery({
    queryKey: ["my-created-badges", user?.pubkey ?? ""],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      return nostr.query(
        [
          {
            kinds: [BADGE_DEFINITION_KIND],
            authors: [user.pubkey],
            limit: 200,
          },
        ],
        { signal },
      );
    },
    enabled: !!user,
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

  // Optimistic local ordering state for accepted badges
  const [localRefs, setLocalRefs] = useState(refs);
  useEffect(() => {
    setLocalRefs(refs);
  }, [refs]);

  const isLoadingAccepted = isLoadingRefs || isLoadingDefs;

  return (
    <div className="px-4 py-4 space-y-6">
      {/* ── Pending Badges ── */}
      {(pendingCount > 0 || isLoadingPending) && (
        <section>
          <SectionHeader
            title="Pending"
            count={isLoadingPending ? undefined : pendingCount}
            icon={<Clock className="size-4" />}
          />
          {isLoadingPending || isLoadingPendingDefs ? (
            <div className="space-y-2 mt-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <PendingBadgeSkeleton key={i} />
              ))}
            </div>
          ) : (
            <PendingBadgeList
              pendingBadges={pendingBadges}
              badgeMap={pendingBadgeMap}
            />
          )}
        </section>
      )}

      {/* ── Accepted Badges ── */}
      <section>
        <SectionHeader
          title="Accepted"
          count={isLoadingAccepted ? undefined : localRefs.length}
          icon={<Check className="size-4" />}
        />
        {isLoadingAccepted ? (
          <div className="space-y-2 mt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <AcceptedBadgeSkeleton key={i} />
            ))}
          </div>
        ) : localRefs.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">
            No accepted badges yet. When you accept a badge, it will appear
            here.
          </p>
        ) : (
          <AcceptedBadgeList
            refs={localRefs}
            setRefs={setLocalRefs}
            badgeMap={badgeMap}
          />
        )}
      </section>

      {/* ── Created Badges ── */}
      <section>
        <SectionHeader
          title="Created"
          count={isLoadingCreated ? undefined : createdBadges.length}
          icon={<Pencil className="size-4" />}
          action={
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onOpenCreate}
            >
              <Award className="size-3" />
              New Badge
            </Button>
          }
        />
        {isLoadingCreated ? (
          <div className="space-y-2 mt-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <CreatedBadgeSkeleton key={i} />
            ))}
          </div>
        ) : createdBadges.length === 0 ? (
          <p className="text-sm text-muted-foreground mt-2">
            You haven't created any badges yet.
          </p>
        ) : (
          <CreatedBadgeList badges={createdBadges} />
        )}
      </section>
    </div>
  );
}

// ─── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  title,
  count,
  icon,
  action,
}: {
  title: string;
  count?: number;
  icon: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-muted-foreground">{icon}</span>
      <h2 className="text-sm font-semibold">{title}</h2>
      {count !== undefined && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {count}
        </Badge>
      )}
      {action && <div className="ml-auto">{action}</div>}
    </div>
  );
}

// ─── Pending Badge List ────────────────────────────────────────────────────────

function PendingBadgeList({
  pendingBadges,
  badgeMap,
}: {
  pendingBadges: PendingBadge[];
  badgeMap: Map<string, BadgeDefinition>;
}) {
  const [dismissedATags, setDismissedATags] = useState<Set<string>>(new Set());
  const visibleBadges = pendingBadges.filter(
    (p) => !dismissedATags.has(p.aTag),
  );

  const handleDismiss = useCallback((aTag: string) => {
    setDismissedATags((prev) => new Set(prev).add(aTag));
  }, []);

  if (visibleBadges.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
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

function PendingBadgeRow({
  pending,
  badge,
  onDismiss,
}: {
  pending: PendingBadge;
  badge: BadgeDefinition | undefined;
  onDismiss: () => void;
}) {
  const { toast } = useToast();
  const { mutate: acceptBadge, isPending: isAccepting } = useAcceptBadge();

  const handleAccept = () => {
    acceptBadge(
      { aTag: pending.aTag, awardEventId: pending.awardEvent.id },
      {
        onSuccess: () => toast({ title: "Badge accepted!" }),
        onError: () =>
          toast({ title: "Failed to accept badge", variant: "destructive" }),
      },
    );
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card animate-pending-glow transition-colors">
      {badge ? (
        <BadgeThumbnail badge={badge} size={40} className="shrink-0" />
      ) : (
        <Skeleton className="size-10 rounded-lg shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {badge?.name ?? pending.identifier}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <IssuerName pubkey={pending.issuerPubkey} />
          <span className="text-muted-foreground text-xs">·</span>
          <span className="text-xs text-muted-foreground">
            {timeAgo(pending.awardedAt)}
          </span>
        </div>
      </div>
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

// ─── Accepted Badge List ───────────────────────────────────────────────────────

interface AcceptedRef {
  aTag: string;
  eTag?: string;
  kind: number;
  pubkey: string;
  identifier: string;
}

function AcceptedBadgeList({
  refs,
  setRefs,
  badgeMap,
}: {
  refs: AcceptedRef[];
  setRefs: React.Dispatch<React.SetStateAction<AcceptedRef[]>>;
  badgeMap: Map<string, BadgeDefinition>;
}) {
  const { toast } = useToast();
  const { mutate: reorderBadges, isPending: isReordering } = useReorderBadges();
  const { mutate: removeBadge } = useRemoveBadge();

  const moveUp = useCallback(
    (index: number) => {
      if (index <= 0) return;
      const next = [...refs];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      setRefs(next);
      reorderBadges(
        next.map((r) => ({ aTag: r.aTag, eTag: r.eTag })),
        {
          onError: () =>
            toast({
              title: "Failed to reorder badges",
              variant: "destructive",
            }),
        },
      );
    },
    [refs, setRefs, reorderBadges, toast],
  );

  const moveDown = useCallback(
    (index: number) => {
      if (index >= refs.length - 1) return;
      const next = [...refs];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      setRefs(next);
      reorderBadges(
        next.map((r) => ({ aTag: r.aTag, eTag: r.eTag })),
        {
          onError: () =>
            toast({
              title: "Failed to reorder badges",
              variant: "destructive",
            }),
        },
      );
    },
    [refs, setRefs, reorderBadges, toast],
  );

  const handleRemove = useCallback(
    (aTag: string) => {
      setRefs((prev) => prev.filter((r) => r.aTag !== aTag));
      removeBadge(aTag, {
        onError: () =>
          toast({ title: "Failed to remove badge", variant: "destructive" }),
      });
    },
    [setRefs, removeBadge, toast],
  );

  return (
    <div className="space-y-1.5 relative mt-2">
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

function AcceptedBadgeRow({
  ref_,
  index,
  total,
  badge,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  ref_: AcceptedRef;
  index: number;
  total: number;
  badge: BadgeDefinition | undefined;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-accent/30 transition-colors group">
      <span className="text-xs font-mono text-muted-foreground w-5 text-center shrink-0">
        {index + 1}
      </span>
      {badge ? (
        <BadgeThumbnail badge={badge} size={40} className="shrink-0" />
      ) : (
        <Skeleton className="size-10 rounded-lg shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium truncate block">
          {badge?.name ?? ref_.identifier}
        </span>
        <IssuerName pubkey={ref_.pubkey} />
      </div>
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

// ─── Created Badge List ────────────────────────────────────────────────────────

function CreatedBadgeList({ badges }: { badges: ParsedBadge[] }) {
  const [editingBadge, setEditingBadge] = useState<ParsedBadge | null>(null);

  if (editingBadge) {
    return (
      <div className="mt-2 max-w-lg">
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 -ml-2"
            onClick={() => setEditingBadge(null)}
          >
            <X className="size-4" />
            Cancel
          </Button>
          <h3 className="text-xs font-semibold text-muted-foreground">
            Editing: {editingBadge.badge.name}
          </h3>
        </div>
        <EditBadgeForm
          badge={editingBadge}
          onClose={() => setEditingBadge(null)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-2">
      {badges.map((badge) => (
        <CreatedBadgeRow
          key={badge.aTag}
          badge={badge}
          onEdit={setEditingBadge}
        />
      ))}
    </div>
  );
}

function CreatedBadgeRow({
  badge,
  onEdit,
}: {
  badge: ParsedBadge;
  onEdit: (badge: ParsedBadge) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [awardOpen, setAwardOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await publishEvent({
        kind: 5,
        content: "",
        tags: [
          [
            "a",
            `${BADGE_DEFINITION_KIND}:${badge.event.pubkey}:${badge.badge.identifier}`,
          ],
          ["k", BADGE_DEFINITION_KIND.toString()],
        ],
      } as Omit<NostrEvent, "id" | "pubkey" | "sig">);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-created-badges"] });
      toast({
        title: "Deletion requested",
        description: "The badge has been requested for deletion.",
      });
    },
    onError: () => {
      toast({ title: "Failed to delete", variant: "destructive" });
    },
  });

  const naddr = nip19.naddrEncode({
    kind: BADGE_DEFINITION_KIND,
    pubkey: badge.event.pubkey,
    identifier: badge.badge.identifier,
  });

  return (
    <>
      <Card className="group transition-colors hover:border-primary/20">
        <CardContent className="flex items-center gap-4 p-4">
          <BadgeThumbnail badge={badge.badge} size={48} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{badge.badge.name}</p>
            {badge.badge.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                {badge.badge.description}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">
              {badge.badge.identifier}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="View"
              asChild
            >
              <Link to={`/${naddr}`}>
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Award"
              onClick={() => setAwardOpen(true)}
            >
              <Users className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title="Edit"
              onClick={() => onEdit(badge)}
            >
              <Pencil className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  title="Delete"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete "{badge.badge.name}"?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This publishes a deletion request (NIP-09). Relays should
                    remove the badge definition, but existing awards already
                    issued will remain.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="size-4 animate-spin mr-1.5" />
                    ) : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <AwardBadgeDialog
        open={awardOpen}
        onOpenChange={setAwardOpen}
        badgeATag={badge.aTag}
        badgeName={badge.badge.name}
      />
    </>
  );
}

function CreatedBadgeSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <Skeleton className="size-12 rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
        </div>
        <div className="flex gap-1">
          <Skeleton className="size-8 rounded" />
          <Skeleton className="size-8 rounded" />
          <Skeleton className="size-8 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Edit Badge Form (inline) ──────────────────────────────────────────────────

function EditBadgeForm({
  badge,
  onClose,
}: {
  badge: ParsedBadge;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(badge.badge.name);
  const [description, setDescription] = useState(badge.badge.description ?? "");
  const [imageUrl, setImageUrl] = useState(badge.badge.image ?? "");
  const [imagePreview, setImagePreview] = useState(badge.badge.image ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const identifier = badge.badge.identifier;

  const handleFileSelect = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file",
          description: "Please select an image file.",
          variant: "destructive",
        });
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target?.result as string);
      reader.readAsDataURL(file);
      try {
        const [[, url]] = await uploadFile(file);
        setImageUrl(url);
      } catch {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    },
    [uploadFile, toast],
  );

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const newTags: string[][] = [];
      newTags.push(["d", identifier]);
      newTags.push(["name", name.trim()]);
      if (description.trim()) newTags.push(["description", description.trim()]);
      if (imageUrl) newTags.push(["image", imageUrl]);
      for (const tag of badge.event.tags) {
        if (["d", "name", "description", "image", "thumb"].includes(tag[0]))
          continue;
        newTags.push(tag);
      }
      await publishEvent({
        kind: BADGE_DEFINITION_KIND,
        content: "",
        tags: newTags,
      } as Omit<NostrEvent, "id" | "pubkey" | "sig">);
      queryClient.invalidateQueries({ queryKey: ["my-created-badges"] });
      toast({ title: "Badge updated!" });
      onClose();
    } catch {
      toast({ title: "Failed to update badge", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [
    name,
    description,
    imageUrl,
    identifier,
    badge.event.tags,
    publishEvent,
    queryClient,
    toast,
    onClose,
  ]);

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-sm font-medium mb-1.5 block">Image</Label>
        <div
          className="relative w-24 h-24 rounded-xl overflow-hidden border border-border cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt=""
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-secondary/20">
              <Upload className="size-5 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="size-4 text-white" />
          </div>
          {isUploading && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) =>
            e.target.files?.[0] && handleFileSelect(e.target.files[0])
          }
        />
      </div>
      <div>
        <Label htmlFor="edit-name" className="text-sm font-medium mb-1.5 block">
          Name
        </Label>
        <Input
          id="edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <Label className="text-sm font-medium mb-1.5 block">Identifier</Label>
        <Input value={identifier} disabled className="text-muted-foreground" />
      </div>
      <div>
        <Label htmlFor="edit-desc" className="text-sm font-medium mb-1.5 block">
          Description
        </Label>
        <Textarea
          id="edit-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
          {isSaving ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Follows Feed Tab
// ═══════════════════════════════════════════════════════════════════════════════

function FollowsFeedTab({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const feedQuery = useBadgeFeed("follows");

  const {
    data: rawData,
    isPending,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = feedQuery;

  // Auto-fetch page 2
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && rawData?.pages?.length === 1) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, rawData?.pages?.length, fetchNextPage]);

  const { ref: scrollRef, inView } = useInView({
    threshold: 0,
    rootMargin: "400px",
  });

  useEffect(() => {
    if (inView && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const feedEvents = useMemo(() => {
    if (!rawData?.pages) return [];
    const seen = new Set<string>();
    return (rawData.pages as NostrEvent[][]).flat().filter((event) => {
      if (seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    });
  }, [rawData?.pages]);

  const showSkeleton = isPending || (isLoading && !rawData);

  return (
    <PullToRefresh onRefresh={onRefresh}>
      {showSkeleton ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <NoteCardSkeleton key={i} />
          ))}
        </div>
      ) : feedEvents.length > 0 ? (
        <div>
          {feedEvents.map((event) => (
            <NoteCard key={event.id} event={event} />
          ))}
          {hasNextPage && (
            <div ref={scrollRef} className="py-4">
              {isFetchingNextPage && (
                <div className="flex justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <FeedEmptyState message="No badge activity from people you follow yet." />
      )}
    </PullToRefresh>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared
// ═══════════════════════════════════════════════════════════════════════════════

function IssuerName({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name ?? genUserName(pubkey);
  return (
    <span className="text-xs text-muted-foreground truncate">by {name}</span>
  );
}
