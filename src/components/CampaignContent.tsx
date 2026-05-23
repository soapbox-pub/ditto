import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { CalendarClock, Check, Copy, ExternalLink, HandHeart, MapPin, ShieldCheck, Target, Zap } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import { ZapDialog } from '@/components/ZapDialog';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import {
  formatCampaignDeadline,
  formatUsdGoal,
  getCampaignCountryLabel,
  parseCampaign,
  type CampaignWallets,
} from '@/lib/campaign';
import { openUrl } from '@/lib/downloadFile';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

const ArticleContent = lazy(() =>
  import('@/components/ArticleContent').then((m) => ({ default: m.ArticleContent })),
);

interface CampaignContentProps {
  event: NostrEvent;
  /** When true, render the rich detail-page variant (full markdown story + donate panel). */
  expanded?: boolean;
  className?: string;
}

/**
 * Renders a kind 33863 Fundraiser/Campaign event (see `NIP.md`).
 *
 * Two variants:
 *
 * - **Feed card** (default) — banner, "Fundraiser" pill, title, summary,
 *   optional goal bar, and country / deadline meta. Donation widgets
 *   live on the expanded view; the feed card is a navigation target.
 * - **Expanded** (`expanded`) — same header plus a "Donate" button that
 *   opens a dialog with the BIP-21 QR and a single copyable URI, and
 *   the campaign's markdown story rendered below.
 *
 * Malformed events (missing `d`, blank `title`, no valid `w` wallet)
 * fail parse and render `null`, letting the feed quietly skip them.
 */
export function CampaignContent({ event, expanded = false, className }: CampaignContentProps) {
  const campaign = useMemo(() => parseCampaign(event), [event]);

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
        <div>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-primary">
            <HandHeart className="size-3" />
            Fundraiser
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

      {/* Expanded view: donate button + full markdown story */}
      {expanded && (
        <>
          <DonateButton event={event} wallets={campaign.wallets} title={campaign.title} />

          {campaign.story.trim() && (
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
        </>
      )}
    </div>
  );
}

/**
 * Build the BIP-21 URI for a campaign's wallets.
 *
 * - Dual-endpoint: `bitcoin:<bc1-address>?sp=<sp1-code>` — BIP-352-aware
 *   wallets pick the `sp=` extension; legacy wallets fall back to the
 *   on-chain address.
 * - On-chain only:   `bitcoin:<bc1-address>`
 * - SP only:         `bitcoin:?sp=<sp1-code>`
 *
 * Per the spec the campaign always carries at least one endpoint, so
 * this never returns an empty string for a valid {@link CampaignWallets}.
 */
function buildBip21(wallets: CampaignWallets): string {
  const { onchain, sp } = wallets;
  if (onchain && sp) return `bitcoin:${onchain.value}?sp=${sp.value}`;
  if (onchain) return `bitcoin:${onchain.value}`;
  if (sp) return `bitcoin:?sp=${sp.value}`;
  return '';
}

interface DonateButtonProps {
  /** The raw kind 33863 event — handed to ZapDialog when the user opts
   *  into the in-app Zap flow. */
  event: NostrEvent;
  wallets: CampaignWallets;
  title: string;
}

/**
 * Donate button + dialog rendered on the campaign's detail page. The
 * dialog offers three paths in order of friction:
 *
 * 1. **Zap** — opens {@link ZapDialog} for the campaign event, routing the
 *    send through Ditto's built-in PSBT wallet to the campaign's `w`
 *    endpoint and publishing a kind 8333 receipt (on-chain only; SP
 *    donations publish no Nostr event per spec). Hidden when the user
 *    has no PSBT-capable signer, since they have nothing to sign with.
 * 2. **Open native wallet** — hands the BIP-21 URI to {@link openUrl}
 *    (Capacitor `Share` on native; `window.open` on web — the latter
 *    triggers the registered `bitcoin:` URL handler if one is installed,
 *    e.g. a desktop wallet).
 * 3. **QR + copyable URI** — for users scanning from a separate device
 *    or pasting into an external wallet.
 *
 * There is intentionally **one** URI and **one** input. The combined
 * BIP-21 form transparently handles all wallet modes (legacy wallets
 * read the on-chain address; BIP-352-aware wallets pick up the `?sp=`
 * extension), so splitting it into per-rail rows would only add noise.
 */
function DonateButton({ event, wallets, title }: DonateButtonProps) {
  const bip21 = useMemo(() => buildBip21(wallets), [wallets]);
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { canSignPsbt } = useBitcoinSigner();
  const [copied, setCopied] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  const [zapOpen, setZapOpen] = useState(false);

  const openNativeWallet = useCallback(async () => {
    if (!bip21) return;
    try {
      await openUrl(bip21);
    } catch {
      toast({
        title: 'Could not open wallet',
        description: 'Scan the QR code or copy the address.',
        variant: 'destructive',
      });
    }
  }, [bip21, toast]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(bip21);
      setCopied(true);
      toast({ title: 'Copied', description: 'Payment address copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Please copy manually.',
        variant: 'destructive',
      });
    }
  }, [bip21, toast]);

  // The in-app Zap button only makes sense when the user is logged in
  // and has a PSBT-capable signer. Without one, the parent dialog's
  // QR + Open-native-wallet path is the only way to donate from Ditto.
  const showZapButton = !!user && canSignPsbt;

  const handleZapClick = useCallback(() => {
    setDonateOpen(false);
    // Defer opening the ZapDialog by a frame so the donate dialog's
    // close animation can start; otherwise the two dialogs briefly stack.
    requestAnimationFrame(() => setZapOpen(true));
  }, []);

  if (!bip21) return null;

  return (
    <>
      <Dialog open={donateOpen} onOpenChange={setDonateOpen}>
        <DialogTrigger asChild>
          <Button type="button" size="lg" className="w-full">
            <HandHeart className="size-4" />
            Donate
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Donate to {title}</DialogTitle>
            <DialogDescription>
              {showZapButton
                ? 'Zap from Ditto, open in a native wallet, or scan the QR.'
                : 'Open in a native wallet or scan the QR.'}
            </DialogDescription>
          </DialogHeader>

          {showZapButton && (
            <Button type="button" onClick={handleZapClick} className="w-full" size="lg">
              <Zap className="size-4" />
              Zap
            </Button>
          )}

          <Button
            type="button"
            onClick={openNativeWallet}
            variant={showZapButton ? 'outline' : 'default'}
            className="w-full"
            size="lg"
          >
            <ExternalLink className="size-4" />
            Open native wallet
          </Button>

          {/* QR */}
          <div className="flex justify-center min-w-0">
            <div className="bg-white p-3 rounded-xl" aria-label={`Bitcoin payment QR for ${title}`}>
              <QRCodeCanvas value={bip21} size={240} level="M" className="block" />
            </div>
          </div>

          {/* Single copyable input — exactly matches the QR contents.
              min-w-0 on the button (a grid child of DialogContent) lets
              the truncating span inside actually shrink; without it the
              long bip21 string blows the dialog out to the right. */}
          <button
            type="button"
            onClick={copy}
            className="group flex w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-secondary/40 px-3 py-2 text-left text-xs font-mono hover:bg-secondary motion-safe:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Copy payment address"
          >
            <span className="truncate min-w-0 flex-1 text-foreground">{bip21}</span>
            {copied ? (
              <Check className="size-4 shrink-0 text-primary" />
            ) : (
              <Copy className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
            )}
          </button>

          {wallets.sp && (
            <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5 shrink-0 mt-0.5" />
              <p>
                Silent-payment donations are unlinkable by design and are not reflected in any
                public donation total.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Controlled ZapDialog. ZapDialog detects kind 33863 and routes
          the send through useCampaignZap to the campaign's `w` endpoint.
          nostrify's NostrEvent and nostr-tools' Event are structurally
          identical (id, pubkey, kind, content, tags, created_at, sig);
          we cast to bridge the two type packages. */}
      <ZapDialog target={event as Parameters<typeof ZapDialog>[0]['target']} open={zapOpen} onOpenChange={setZapOpen} />
    </>
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
