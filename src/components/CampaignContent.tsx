import { lazy, Suspense, useMemo } from 'react';
import { CalendarClock, ExternalLink, HandHeart, MapPin, ShieldCheck, Target } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  formatCampaignDeadline,
  formatUsdGoal,
  getCampaignCountryLabel,
  parseCampaign,
} from '@/lib/campaign';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

const ArticleContent = lazy(() =>
  import('@/components/ArticleContent').then((m) => ({ default: m.ArticleContent })),
);

interface CampaignContentProps {
  event: NostrEvent;
  /** When true, render the rich detail-page variant (full markdown story). */
  expanded?: boolean;
  className?: string;
}

/**
 * Renders a kind 33863 Fundraiser/Campaign event (see `NIP.md`).
 *
 * Two variants:
 *
 * - **Feed card** (default) — banner + title + summary + meta row + a
 *   subtle wallet pill. Donation widgets are intentionally omitted —
 *   Ditto isn't a campaign-management app, so we surface the campaign
 *   and link people elsewhere (the campaign's naddr detail page) to
 *   actually donate.
 * - **Expanded** (`expanded`) — banner hero + markdown story rendered
 *   through the article markdown pipeline.
 *
 * Malformed events (missing `d`, blank `title`, no valid `w` wallet)
 * fail parse and render `null`, letting the feed quietly skip them.
 */
export function CampaignContent({ event, expanded = false, className }: CampaignContentProps) {
  const campaign = useMemo(() => parseCampaign(event), [event]);

  // Wallet pill — "On-chain", "Silent payment", or "On-chain + SP".
  const walletLabel = useMemo(() => {
    if (!campaign) return '';
    const { onchain, sp } = campaign.wallets;
    if (onchain && sp) return 'On-chain + Silent payment';
    if (sp) return 'Silent payment';
    return 'On-chain';
  }, [campaign]);

  if (!campaign) return null;

  const banner = sanitizeUrl(campaign.banner);
  const deadline = formatCampaignDeadline(campaign.deadline);
  const country = getCampaignCountryLabel(campaign);

  const isSilentPaymentOnly = !campaign.wallets.onchain;

  // For the expanded view we hand a derived event to ArticleContent
  // with the `title` and `image` tags stripped — we already render
  // both above (heading + banner) and don't want them duplicated by
  // ArticleContent's own header pass.
  const storyOnlyEvent: NostrEvent = {
    ...event,
    tags: event.tags.filter(([n]) => n !== 'title' && n !== 'image'),
  };

  return (
    <div className={cn(expanded ? 'mt-3 space-y-4' : 'mt-2 space-y-3', className)}>
      {/* Banner */}
      <div
        className={cn(
          'relative w-full overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-primary/15 via-primary/5 to-secondary',
          expanded ? 'aspect-[16/8]' : 'aspect-[16/9]',
        )}
      >
        {banner ? (
          <img
            src={banner}
            alt=""
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <HandHeart className="size-12 text-primary/40" />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
            <HandHeart className="size-3" />
            Fundraiser
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
            {walletLabel}
          </span>
        </div>

        <h3
          dir="auto"
          className={cn(
            'font-bold leading-tight tracking-tight break-words',
            expanded ? 'text-2xl sm:text-3xl' : 'text-lg',
          )}
        >
          {campaign.title}
        </h3>

        {campaign.summary && (
          <p
            dir="auto"
            className={cn(
              'text-muted-foreground whitespace-pre-wrap break-words',
              expanded ? 'text-base' : 'text-sm line-clamp-3',
            )}
          >
            {campaign.summary}
          </p>
        )}

        {/* Goal / privacy notice */}
        {isSilentPaymentOnly ? (
          <div className="space-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              <span>Private campaign — totals are not public</span>
            </div>
            {campaign.goalUsd && campaign.goalUsd > 0 && (
              <div className="text-xs text-muted-foreground">
                Target: {formatUsdGoal(campaign.goalUsd)}
              </div>
            )}
          </div>
        ) : (
          campaign.goalUsd && campaign.goalUsd > 0 && (
            <div className="space-y-1.5 text-sm">
              {/* No verified donation total — we render a 0% bar with the
                  goal as the headline so the campaign still reads like a
                  campaign. A future enhancement could plug in verified
                  kind 8333 totals against the campaign's `w` address. */}
              <Progress value={0} className="h-2" />
              <div className="flex items-center justify-between gap-2 text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Target className="size-3.5" />
                  Goal
                </span>
                <span>{formatUsdGoal(campaign.goalUsd)}</span>
              </div>
            </div>
          )
        )}

        {/* Meta row */}
        {(country || deadline) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {country && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {country}
              </span>
            )}
            {deadline && (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5',
                  deadline.isPast && 'text-destructive',
                )}
              >
                <CalendarClock className="size-3.5" />
                {deadline.label}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expanded view: full markdown story */}
      {expanded && campaign.story.trim() && (
        <div className="pt-2">
          <Suspense fallback={<MarkdownStoryFallback />}>
            {/* Render the story through the same Markdown pipeline as
                kind 30023 articles. We strip the campaign's `title`
                and `image` tags before handing the event off — both
                are already rendered above (title heading + banner
                image) and would otherwise duplicate. */}
            <ArticleContent event={storyOnlyEvent} className="text-base" />
          </Suspense>
        </div>
      )}

      {/* Donation hint — Ditto isn't a campaign manager, so we tell
          users where to actually give. The dedicated naddr detail page
          (Ditto's PostDetailPage for addressable events) is reached by
          clicking the card; for the expanded variant we don't need
          this hint since they're already there. */}
      {!expanded && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalLink className="size-3" />
          <span>Open this campaign to donate</span>
        </div>
      )}
    </div>
  );
}

function MarkdownStoryFallback() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  );
}
