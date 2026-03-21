import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { Trophy, ChevronDown, ChevronRight, Loader2, Lock, Sparkles, Award } from 'lucide-react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useClaimAchievement } from '@/hooks/useClaimAchievement';
import { useToast } from '@/hooks/useToast';
import { useAppContext } from '@/hooks/useAppContext';
import { LoginArea } from '@/components/auth/LoginArea';
import { BadgeTierPill } from '@/components/BadgeTierPill';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_CATEGORY_LABELS,
  getAchievementsByCategory,
  type AchievementCategory,
  type AchievementDef,
} from '@/lib/achievementCatalog';
import { BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';

function AchievementCard({ achievement, isLoggedIn, adminPubkey }: {
  achievement: AchievementDef;
  isLoggedIn: boolean;
  adminPubkey: string;
}) {
  const { toast } = useToast();
  const { mutateAsync: claimAchievement, isPending } = useClaimAchievement();

  const handleClaim = async () => {
    const badgeATag = `${BADGE_DEFINITION_KIND}:${adminPubkey}:${achievement.dTag}`;
    try {
      const result = await claimAchievement({ badgeATag, adminPubkey });
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
          <div className="flex items-center justify-center size-12 rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 ring-1 ring-primary/15 transition-transform duration-300 group-hover:scale-105">
            <Award className="size-6 text-primary/70" />
          </div>
          {!isLoggedIn && (
            <div className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center size-4 rounded-full bg-muted ring-1 ring-border">
              <Lock className="size-2.5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold leading-tight">{achievement.name}</span>
            {achievement.tier && <BadgeTierPill tier={achievement.tier} />}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{achievement.description}</p>

          {/* Progress bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground/70 tabular-nums">
                0 / {achievement.target.toLocaleString()}
              </span>
            </div>
            <Progress value={0} className="h-1.5" />
          </div>
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

function CategorySection({ category, achievements, isLoggedIn, adminPubkey }: {
  category: AchievementCategory;
  achievements: AchievementDef[];
  isLoggedIn: boolean;
  adminPubkey: string;
}) {
  const [open, setOpen] = useState(true);
  const label = ACHIEVEMENT_CATEGORY_LABELS[category];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-3 w-full px-1 py-3 group cursor-pointer">
        <div className="flex items-center justify-center size-5 text-muted-foreground transition-transform duration-200">
          {open ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </div>
        <span className="text-sm font-semibold tracking-tight">{label}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {achievements.length}
        </span>
        <div className="flex-1 h-px bg-border/50 ml-2" />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="grid gap-3 pb-4 pl-1">
          {achievements.map((achievement) => (
            <AchievementCard
              key={achievement.dTag}
              achievement={achievement}
              isLoggedIn={isLoggedIn}
              adminPubkey={adminPubkey}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function AchievementsPage() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const isLoggedIn = !!user;
  const adminPubkey = config.nip85StatsPubkey;
  const categorized = getAchievementsByCategory();
  const totalCount = ACHIEVEMENT_CATALOG.length;

  useSeoMeta({
    title: `Achievements | ${config.appName}`,
    description: 'Track your progress and claim achievement badges',
  });

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

      {/* Summary bar */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground tabular-nums">0</span> of{' '}
            <span className="font-semibold text-foreground tabular-nums">{totalCount}</span>{' '}
            achievements
          </span>
          <span className="text-xs text-muted-foreground/60 tabular-nums">0%</span>
        </div>
        <Progress value={0} className="h-2" />
      </div>

      {/* Category sections */}
      <div className="px-4 pt-4 space-y-1">
        {[...categorized.entries()].map(([category, achievements]) => (
          <CategorySection
            key={category}
            category={category}
            achievements={achievements}
            isLoggedIn={isLoggedIn}
            adminPubkey={adminPubkey}
          />
        ))}
      </div>
    </main>
  );
}
