import { useId, useState } from 'react';
import { ExternalLink, Copy, Check, Lock, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { openUrl } from '@/lib/downloadFile';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useArmadaInvitePreview } from '@/hooks/useArmadaInvitePreview';
import { useArmadaImage } from '@/hooks/useArmadaImage';
import type { ArmadaInvite, ArmadaInvitePreview } from '@/lib/armadaInvite';
import { cn } from '@/lib/utils';

interface VectorInviteEmbedProps {
  invite: ArmadaInvite;
  className?: string;
  /**
   * `'embed'` (default) — a compact inline card for note content.
   * `'detail'` — a larger, centered hero card for a full detail page.
   */
  variant?: 'embed' | 'detail';
}

/** Vector's signature mint. Fixed hex (not the app theme) so the card reads as Vector. */
const VECTOR_MINT = '#33DB98';
/** A darker mint for small brand text so it clears WCAG contrast on light backgrounds. */
const VECTOR_MINT_TEXT = 'text-[#147a52] dark:text-[#33DB98]';

/**
 * Vector's logomark (mirrors the app icon, src-tauri/../vector-logo.svg): a
 * figure with raised arms forming a "V" over a head, above two descending
 * chevrons, in Vector's mint gradient. `gradient`/`filter` ids are made unique
 * per instance to avoid clashes when several cards render at once.
 */
function VectorMark({ className }: { className?: string }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '');
  const grad = `vec-grad-${uid}`;
  const glow = `vec-glow-${uid}`;
  return (
    <svg viewBox="46 14 120 150" fill="none" role="img" aria-label="Vector" className={className}>
      <defs>
        <linearGradient
          id={grad}
          x1="105.743"
          y1="146.145"
          x2="105.743"
          y2="46.193"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2b976c" />
          <stop offset=".5" stopColor="#33db98" />
          <stop offset="1" stopColor="#59fcb3" />
        </linearGradient>
        <filter id={glow} x="43.104" y="0" width="126" height="160" filterUnits="userSpaceOnUse">
          <feGaussianBlur result="blur" stdDeviation="7.903" />
          <feFlood floodColor="#59fcb3" floodOpacity=".57" />
          <feComposite in2="blur" operator="in" />
          <feComposite in="SourceGraphic" />
        </filter>
      </defs>
      {/* Upper and lower descending chevrons (faded). */}
      <path
        d="M143.892 69.377l-29.745 27.031a12.5 12.5 0 0 1-16.808 0L67.595 69.377l-.025-.025V88.56c0 3.314 1.401 6.499 3.843 8.739l26.317 24.133c2.193 2.011 5.038 3.118 8.013 3.118s5.821-1.107 8.013-3.118l26.317-24.132c2.442-2.24 3.843-5.425 3.843-8.739V69.352l-.025.025z"
        fill={`url(#${grad})`}
        opacity=".57"
      />
      <path
        d="M143.892 101.393l-29.745 27.031a12.5 12.5 0 0 1-16.808 0l-29.745-27.031-.025-.025v19.208c0 3.314 1.401 6.499 3.843 8.739l26.317 24.133c2.193 2.011 5.038 3.118 8.013 3.118s5.821-1.107 8.013-3.118l26.317-24.132c2.442-2.24 3.843-5.425 3.843-8.739v-19.208l-.025.025z"
        fill={`url(#${grad})`}
        opacity=".25"
      />
      {/* Raised arms forming the "V". */}
      <path
        d="M71.553 64.792l26.317 24.133c3.546 3.252 8.802 4.141 13.548 1.803.765-.377 1.465-.874 2.094-1.451l26.701-24.485c2.443-2.24 3.843-5.425 3.843-8.739V33.559c0-4.975-3.901-9.189-8.874-9.317-5.144-.132-9.356 3.998-9.356 9.112v15.794a9.33 9.33 0 0 1-3.024 6.875l-8.475 7.771a12.5 12.5 0 0 1-16.891 0l-8.475-7.771a9.33 9.33 0 0 1-3.024-6.875V33.559c0-4.975-3.901-9.189-8.874-9.317-5.144-.133-9.356 3.998-9.356 9.112v22.7c0 3.314 1.401 6.499 3.843 8.739z"
        fill={`url(#${grad})`}
        filter={`url(#${glow})`}
      />
      {/* Head. */}
      <circle cx="105.743" cy="42.484" r="12.032" fill={`url(#${grad})`} filter={`url(#${glow})`} />
    </svg>
  );
}

/**
 * The invite's icon tile: the decrypted community icon when available,
 * otherwise Vector's "V" mark on Vector's ink background.
 */
function VectorIconTile({
  preview,
  sizeClass,
  markClass,
}: {
  preview: ArmadaInvitePreview | null | undefined;
  sizeClass: string;
  markClass: string;
}) {
  const iconUrl = useArmadaImage(preview?.icon);
  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#0a0a0a]',
        sizeClass,
      )}
    >
      {iconUrl ? (
        <img src={iconUrl} alt={preview?.name || 'Community icon'} className="size-full object-cover" decoding="async" />
      ) : (
        <VectorMark className={markClass} />
      )}
    </div>
  );
}

/** Localized "N channels" (or "no channels" / "1 channel"). */
function channelsLabel(count: number): string {
  if (count <= 0) return 'No channels';
  return `${count} ${count === 1 ? 'channel' : 'channels'}`;
}

/** The mint header eyebrow: Vector "V" mark + wordmark + subtitle. */
function VectorEyebrow({ markClass, textClass }: { markClass: string; textClass: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <VectorMark className={markClass} />
      <span className={cn('font-semibold uppercase tracking-wider', VECTOR_MINT_TEXT, textClass)}>
        Vector
      </span>
      <span className={cn('font-medium uppercase tracking-wider text-muted-foreground', textClass)}>
        · Community invite
      </span>
    </div>
  );
}

/**
 * Awareness card for an encrypted community invite link (Concord CORD-05,
 * kind 33301) shared from Vector's own domain (vectorapp.io). We feature
 * Vector's branding — its mint palette and "V" logomark — with "Open in
 * Vector" as the primary action, since the person clearly uses Vector. Armada
 * (our client) is offered as a subtle secondary link. The bundle content is
 * NIP-44 encrypted; when the URL `#fragment` secret is present we decrypt the
 * public preview (community name, icon, channel count) to render a real
 * invitation. Ditto can't open encrypted communities itself.
 */
export function VectorInviteEmbed({ invite, className, variant = 'embed' }: VectorInviteEmbedProps) {
  const vectorUrl = sanitizeUrl(invite.vectorUrl);
  const armadaUrl = sanitizeUrl(invite.armadaUrl);
  const [copied, setCopied] = useState(false);

  const { data: preview, isLoading } = useArmadaInvitePreview(invite);
  const loadingPreview = !invite.missingSecret && isLoading;
  const communityName = preview?.name?.trim();

  const handleCopy = () => {
    if (!vectorUrl) return;
    navigator.clipboard.writeText(vectorUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openInVector = () => {
    if (vectorUrl) openUrl(vectorUrl);
  };

  const openInArmada = () => {
    if (armadaUrl) openUrl(armadaUrl);
  };

  // Solid mint CTA that reads as Vector in either theme.
  const mintButton = 'text-[#0a0a0a] hover:brightness-105 active:brightness-95 border-0';
  const mintButtonStyle = { backgroundColor: VECTOR_MINT };

  // The subtle "prefer our client instead" link.
  const armadaFallback = !invite.missingSecret && armadaUrl && (
    <button
      type="button"
      className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2 hover:text-foreground transition-colors"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openInArmada();
      }}
    >
      Open in Armada instead
    </button>
  );

  if (variant === 'detail') {
    return (
      <div
        className={cn(
          'relative mx-auto w-full max-w-md overflow-hidden text-center',
          'rounded-xl border shadow-sm',
          'bg-gradient-to-br from-[#33db98]/10 via-background to-[#59fcb3]/[0.06]',
          className,
        )}
        style={{ borderColor: 'rgba(51,219,152,0.3)' }}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full blur-3xl"
          style={{ backgroundColor: 'rgba(51,219,152,0.2)' }}
          aria-hidden
        />
        <div className="relative flex flex-col items-center px-6 py-8 space-y-4">
          <VectorEyebrow markClass="size-4" textClass="text-xs" />

          <VectorIconTile preview={preview} sizeClass="size-20" markClass="size-16" />

          <div className="space-y-1.5">
            {loadingPreview ? (
              <Skeleton className="mx-auto h-6 w-40" />
            ) : (
              <h2 className="text-lg font-bold leading-tight">
                {communityName || 'Encrypted community'}
              </h2>
            )}
            <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5 shrink-0" />
                {invite.missingSecret ? 'Missing secret' : 'Encrypted'}
              </span>
              {preview && preview.channelCount > 0 && (
                <span className="inline-flex items-center gap-1.5">
                  <Hash className="size-3.5 shrink-0" />
                  {channelsLabel(preview.channelCount)}
                </span>
              )}
            </div>
            <p className="mx-auto max-w-xs text-sm text-muted-foreground">
              {invite.missingSecret
                ? "Ask whoever shared it for a fresh link — the secret can't be recovered."
                : preview?.expired
                  ? 'This invite has expired. Ask for a fresh link to join.'
                  : "Ditto can't open encrypted communities. Open this invite in Vector to view and join."}
            </p>
          </div>

          <div className="flex w-full max-w-xs flex-col gap-2 pt-1">
            {invite.missingSecret ? (
              <Button variant="secondary" disabled>
                Invite incomplete
              </Button>
            ) : (
              <Button className={mintButton} style={mintButtonStyle} disabled={!vectorUrl} onClick={openInVector}>
                <ExternalLink className="size-4" />
                Open in Vector
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              disabled={!vectorUrl}
              onClick={handleCopy}
            >
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy invite link'}
            </Button>
            {armadaFallback && <div className="pt-0.5">{armadaFallback}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative block max-w-sm w-full my-2.5 overflow-hidden',
        'rounded-lg border shadow-sm',
        'bg-gradient-to-br from-[#33db98]/10 via-background to-[#59fcb3]/[0.06]',
        className,
      )}
      style={{ borderColor: 'rgba(51,219,152,0.3)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Mint glow bleeding in from the top-right, echoing Vector's neon. */}
      <div
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full blur-2xl"
        style={{ backgroundColor: 'rgba(51,219,152,0.2)' }}
        aria-hidden
      />

      <div className="relative px-3.5 py-3 space-y-3">
        <VectorEyebrow markClass="size-3.5" textClass="text-[11px]" />

        <div className="flex items-center gap-3 min-w-0">
          <VectorIconTile preview={preview} sizeClass="size-12" markClass="size-9" />
          <div className="min-w-0 flex-1">
            {loadingPreview ? (
              <Skeleton className="h-4 w-28" />
            ) : (
              <p className="font-semibold leading-tight truncate">
                {communityName || 'Encrypted community'}
              </p>
            )}
            <p className="mt-0.5 flex items-center gap-2.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3 shrink-0" />
                {invite.missingSecret ? 'Missing secret' : 'Encrypted'}
              </span>
              {preview && preview.channelCount > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Hash className="size-3 shrink-0" />
                  {preview.channelCount}
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {invite.missingSecret ? (
            <Button variant="secondary" className="flex-1" disabled>
              Invite incomplete
            </Button>
          ) : (
            <Button
              className={cn('flex-1', mintButton)}
              style={mintButtonStyle}
              disabled={!vectorUrl}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openInVector();
              }}
            >
              <ExternalLink className="size-4" />
              Open in Vector
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="shrink-0"
            aria-label={copied ? 'Link copied' : 'Copy invite link'}
            disabled={!vectorUrl}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCopy();
            }}
          >
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>

        {armadaFallback && <div className="pt-0.5 text-center">{armadaFallback}</div>}
      </div>
    </div>
  );
}
