import { useState, type CSSProperties } from 'react';
import { ExternalLink, Copy, Check, Lock, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { openUrl } from '@/lib/downloadFile';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useArmadaInvitePreview } from '@/hooks/useArmadaInvitePreview';
import { useArmadaImage } from '@/hooks/useArmadaImage';
import type { ArmadaInvite, ArmadaInvitePreview } from '@/lib/armadaInvite';
import { cn } from '@/lib/utils';

interface ArmadaInviteEmbedProps {
  invite: ArmadaInvite;
  className?: string;
  /**
   * `'embed'` (default) — a compact inline card for note content.
   * `'detail'` — a larger, centered hero card for a full detail page.
   */
  variant?: 'embed' | 'detail';
}

/**
 * Armada's cut-corner "vessel" chrome: top-left + bottom-right chamfered, the
 * remaining two corners softly rounded (mirrors Armada's `.clip-corner-lg`).
 * `cut` is the bevel size, `radius` the rounding on the non-cut corners.
 */
function cutCorners(cut: string, radius = '0.4rem'): CSSProperties {
  return {
    borderRadius: radius,
    clipPath: `polygon(${cut} 0, 100% 0, 100% calc(100% - ${cut}), calc(100% - ${cut}) 100%, 0 100%, 0 ${cut})`,
  };
}

/**
 * The Armada crest (Concord's flagship client): a cut-corner vessel silhouette
 * with an advancing-"A" blade. Single-color, inherits `currentColor`, so it
 * tints to the active theme. Mirrors public/logo-mark.svg.
 */
function ArmadaCrest({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 256 256"
      fill="none"
      role="img"
      aria-label="Armada"
      className={className}
    >
      <path
        d="M64 16 H232 a8 8 0 0 1 8 8 V192 L192 240 H24 a8 8 0 0 1 -8 -8 V64 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="12"
      />
      <path d="M128 56 L180 162 H158 L128 100 L98 162 H76 Z" fill="currentColor" />
      <g stroke="currentColor" strokeLinecap="round" opacity="0.55">
        <path d="M88 184 H168" strokeWidth="7" />
        <path d="M104 200 H152" strokeWidth="5" opacity="0.7" />
      </g>
    </svg>
  );
}

/**
 * The invite's cut-corner icon tile: the decrypted community icon when
 * available, otherwise the Armada crest. `size` is a Tailwind size-* value.
 */
function InviteIconTile({
  preview,
  sizeClass,
  crestClass,
  cut,
}: {
  preview: ArmadaInvitePreview | null | undefined;
  sizeClass: string;
  crestClass: string;
  cut: string;
}) {
  const iconUrl = useArmadaImage(preview?.icon);
  return (
    <div
      className={cn('relative flex shrink-0 items-center justify-center overflow-hidden bg-primary/15', sizeClass)}
      style={cutCorners(cut)}
    >
      {iconUrl ? (
        <img src={iconUrl} alt={preview?.name || 'Community icon'} className="size-full object-cover" />
      ) : (
        <ArmadaCrest className={cn('text-primary', crestClass)} />
      )}
    </div>
  );
}

/** Localized "N channels" (or "no channels" / "1 channel"). */
function channelsLabel(count: number): string {
  if (count <= 0) return 'No channels';
  return `${count} ${count === 1 ? 'channel' : 'channels'}`;
}

/**
 * Awareness card for an encrypted community invite link (Concord CORD-05,
 * kind 33301) posted in a note. The invite bundle's content is NIP-44
 * encrypted; its unlock key lives only in the URL `#fragment`. When the
 * fragment is present we decrypt the bundle's public preview (community name,
 * icon, channel count) to render a real invitation — the same preview Armada
 * shows before you accept. Ditto can't join an encrypted community, so the
 * primary action opens the invite in Armada (or copies the link). Uses the
 * active theme's `primary` accent with Armada's cut-corner chrome.
 */
export function ArmadaInviteEmbed({ invite, className, variant = 'embed' }: ArmadaInviteEmbedProps) {
  const safeUrl = sanitizeUrl(invite.openUrl);
  const [copied, setCopied] = useState(false);

  const { data: preview, isLoading } = useArmadaInvitePreview(invite);
  const loadingPreview = !invite.missingSecret && isLoading;
  const communityName = preview?.name?.trim();

  const handleCopy = () => {
    if (!safeUrl) return;
    navigator.clipboard.writeText(safeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const openInArmada = () => {
    if (safeUrl) openUrl(safeUrl);
  };

  if (variant === 'detail') {
    return (
      <div
        className={cn(
          'relative mx-auto w-full max-w-md overflow-hidden text-center',
          'border border-primary/25 rounded-xl',
          'bg-gradient-to-br from-primary/10 via-background to-primary/[0.06]',
          'shadow-sm',
          className,
        )}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-14 size-40 rounded-full bg-primary/20 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-col items-center px-6 py-8 space-y-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Armada
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              · Community invite
            </span>
          </div>

          <InviteIconTile preview={preview} sizeClass="size-20" crestClass="size-14" cut="1rem" />

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
                  : "Ditto can't open encrypted communities. Open this invite in Armada to view and join."}
            </p>
          </div>

          <div className="flex w-full max-w-xs flex-col gap-2 pt-1">
            {invite.missingSecret ? (
              <Button variant="secondary" style={cutCorners('0.85rem')} disabled>
                Invite incomplete
              </Button>
            ) : (
              <Button style={cutCorners('0.85rem')} disabled={!safeUrl} onClick={openInArmada}>
                <ExternalLink className="size-4" />
                Open in Armada
              </Button>
            )}
            <Button
              type="button"
              variant="secondary"
              className="bg-primary/10 text-primary hover:bg-primary/20"
              style={cutCorners('0.85rem')}
              disabled={!safeUrl}
              onClick={handleCopy}
            >
              {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy invite link'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group relative block max-w-sm w-full my-2.5 overflow-hidden',
        'border border-primary/25 rounded-lg',
        'bg-gradient-to-br from-primary/10 via-background to-primary/[0.06]',
        'shadow-sm',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Theme-tinted glow bleeding in from the top-right, echoing Armada's neon. */}
      <div
        className="pointer-events-none absolute -right-8 -top-10 size-28 rounded-full bg-primary/20 blur-2xl"
        aria-hidden
      />

      <div className="relative px-3.5 py-3 space-y-3">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Armada
          </span>
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            · Community invite
          </span>
        </div>

        <div className="flex items-center gap-3 min-w-0">
          <InviteIconTile preview={preview} sizeClass="size-12" crestClass="size-8" cut="0.65rem" />
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
            <Button variant="secondary" className="flex-1" style={cutCorners('0.7rem')} disabled>
              Invite incomplete
            </Button>
          ) : (
            <Button
              className="flex-1"
              style={cutCorners('0.7rem')}
              disabled={!safeUrl}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openInArmada();
              }}
            >
              <ExternalLink className="size-4" />
              Open in Armada
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="shrink-0 bg-primary/10 text-primary hover:bg-primary/20"
            style={cutCorners('0.7rem')}
            aria-label={copied ? 'Link copied' : 'Copy invite link'}
            disabled={!safeUrl}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleCopy();
            }}
          >
            {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
