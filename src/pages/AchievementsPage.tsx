import { useMemo, useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Trophy, ChevronDown, ChevronRight, Loader2, Lock, Sparkles } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useClaimAchievement } from '@/hooks/useClaimAchievement';
import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { LoginArea } from '@/components/auth/LoginArea';
import { BadgeTierPill } from '@/components/BadgeTierPill';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { parseBadgeDefinition, type BadgeData } from '@/components/BadgeContent';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import {
  BADGE_DEFINITION_KIND,
  BADGE_ACCOUNT_PUBKEY,
  getBadgeTier,
  getBadgeATag,
  isAchievementBadge,
  type BadgeTier,
} from '@/lib/badgeUtils';

/** A parsed achievement badge with its source event and metadata. */
interface AchievementItem {
  event: NostrEvent;
  badge: BadgeData;
  aTag: string;
  tier?: BadgeTier;
  /** The achievement's category from its `t` tags (excluding "achievement"). */
  category: string;
}

/** Human-friendly labels for known achievement categories. */
const CATEGORY_LABELS: Record<string, string> = {
  social: 'Social Milestones',
  profile: 'Profile Completeness',
  content: 'Content Creator',
  community: 'Community & Social',
  lightning: 'Lightning & Economy',
  'power-user': 'Power User',
  treasures: 'Treasures & Exploration',
  'ditto-specials': 'Ditto Specials',
};

/** Get a display label for a category, falling back to title case of the raw value. */
function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extract the achievement category from a badge event's `t` tags.
 * Returns the first `t` tag value that is not "achievement", "shop", or a tier name.
 */
function getAchievementCategory(event: NostrEvent): string {
  const skip = new Set(['achievement', 'shop', 'bronze', 'silver', 'gold', 'diamond']);
  for (const tag of event.tags) {
    if (tag[0] === 't' && tag[1] && !skip.has(tag[1])) {
      return tag[1];
    }
  }
  return 'other';
}

// ─── Components ────────────────────────────────────────────────────────────────

function AchievementCard({ item, isLoggedIn, adminPubkey }: {
  item: AchievementItem;
  isLoggedIn: boolean;
  adminPubkey: string;
}) {
  const { toast } = useToast();
  const { mutateAsync: claimAchievement, isPending } = useClaimAchievement();

  const handleClaim = async () => {
    try {
      const result = await claimAchievement({ badgeATag: item.aTag, adminPubkey });
      if (result.success) {
        toast({ title: 'Achievement claimed!', description: result.message });
      } else {
        toast({ title: 'Claim failed', description: result.message, variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Something went wrong. Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Card className="group relative overflow-hidden border-border/60 transition-all duration-300 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5">
      <CardContent className="flex items-start gap-4 p-4">
        {/* Badge thumbnail */}
        <div className="relative shrink-0">
          <div className="transition-transform duration-300 group-hover:scale-105">
            <BadgeThumbnail badge={item.badge} size={48} className="rounded-full" />
          </div>
          {!isLoggedIn && (
            <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-4 rounded-full bg-muted ring-1 ring-border">
              <Lock className="size-2.5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold leading-tight">{item.badge.name}</span>
            {item.tier && <BadgeTierPill tier={item.tier} />}
          </div>
          {item.badge.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">{item.badge.description}</p>
          )}
        </div>

        {/* Claim button */}
        {isLoggedIn && (
          <div className="shrink-0 pt-0.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-xs font-medium transition-colors hover:bg-primary hover:text-primary-foreground"
              onClick={handleClaim}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <>
                  <Sparkles className="size-3 mr-1.5" />
                  Claim
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CategorySection({ category, items, isLoggedIn, adminPubkey }: {
  category: string;
  items: AchievementItem[];
  isLoggedIn: boolean;
  adminPubkey: string;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-3 w-full px-1 py-3 group cursor-pointer">
        <div className="flex items-center justify-center size-5 text-muted-foreground transition-transform duration-200">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
        <span className="text-sm font-semibold tracking-tight">{categoryLabel(category)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
        <div className="flex-1 h-px bg-border/50 ml-2" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="grid gap-3 pb-4 pl-1">
          {items.map((item) => (
            <AchievementCard
              key={item.badge.identifier}
              item={item}
              isLoggedIn={isLoggedIn}
              adminPubkey={adminPubkey}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function AchievementsSkeleton() {
  return (
    <div className="space-y-4 px-4 pt-6">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="flex items-center gap-4 p-4 rounded-xl border border-border/60">
              <Skeleton className="size-12 rounded-full shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function AchievementsPage() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const isLoggedIn = !!user;
  const adminPubkey = BADGE_ACCOUNT_PUBKEY;

  useSeoMeta({
    title: `Achievements | ${config.appName}`,
    description: 'Track your progress and claim achievement badges',
  });

  // Query achievement badge definitions from the admin pubkey
  const achievementsQuery = useQuery({
    queryKey: ['achievement-badges', adminPubkey],
    queryFn: async ({ signal }) => {
      if (!adminPubkey) return [];
      return nostr.query(
        [{ kinds: [BADGE_DEFINITION_KIND], authors: [adminPubkey], '#t': ['achievement'], limit: 200 }],
        { signal },
      );
    },
    enabled: !!adminPubkey,
    staleTime: 5 * 60_000,
  });

  // Parse and group achievements by category
  const { categorized, totalCount } = useMemo(() => {
    const events = achievementsQuery.data ?? [];
    const items: AchievementItem[] = [];

    for (const event of events) {
      if (!isAchievementBadge(event)) continue;
      const badge = parseBadgeDefinition(event);
      if (!badge) continue;

      items.push({
        event,
        badge,
        aTag: getBadgeATag(event),
        tier: getBadgeTier(event),
        category: getAchievementCategory(event),
      });
    }

    // Group by category, preserving a stable order based on CATEGORY_LABELS keys
    const grouped = new Map<string, AchievementItem[]>();
    // First pass: add known categories in display order
    for (const key of Object.keys(CATEGORY_LABELS)) {
      const matching = items.filter((i) => i.category === key);
      if (matching.length > 0) grouped.set(key, matching);
    }
    // Second pass: any unknown categories
    for (const item of items) {
      if (!grouped.has(item.category)) {
        const matching = items.filter((i) => i.category === item.category);
        grouped.set(item.category, matching);
      }
    }

    return { categorized: grouped, totalCount: items.length };
  }, [achievementsQuery.data]);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      {/* Page header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center size-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/10">
            <Trophy className="size-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Achievements</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Complete challenges and collect badges
            </p>
          </div>
        </div>
      </div>

      {/* Logged-out notice */}
      {!isLoggedIn && (
        <div className="mx-4 mt-4">
          <Card className="border-dashed border-primary/20 bg-primary/[0.02]">
            <CardContent className="flex flex-col items-center gap-3 py-5 px-6 text-center">
              <Lock className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Log in to track your progress and claim badges
              </p>
              <LoginArea className="max-w-60" />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loading state */}
      {achievementsQuery.isLoading && <AchievementsSkeleton />}

      {/* Summary bar */}
      {!achievementsQuery.isLoading && totalCount > 0 && (
        <div className="px-4 pt-5 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground tabular-nums">{totalCount}</span>{' '}
              achievement{totalCount !== 1 ? 's' : ''} available
            </span>
          </div>
          <Progress value={0} className="h-2" />
        </div>
      )}

      {/* Category sections */}
      {!achievementsQuery.isLoading && totalCount > 0 && (
        <div className="px-4 pt-4 space-y-1">
          {[...categorized.entries()].map(([category, items]) => (
            <CategorySection
              key={category}
              category={category}
              items={items}
              isLoggedIn={isLoggedIn}
              adminPubkey={adminPubkey}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!achievementsQuery.isLoading && totalCount === 0 && (
        <div className="mx-4 mt-8">
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <div className="max-w-sm mx-auto space-y-3">
                <Trophy className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">
                  No achievements available yet. Check back later!
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  );
}
