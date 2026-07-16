import { ShieldCheck, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openUrl } from '@/lib/downloadFile';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import type { ArmadaInvite } from '@/lib/armadaInvite';
import { cn } from '@/lib/utils';

interface ArmadaInviteEmbedProps {
  invite: ArmadaInvite;
  className?: string;
}

/**
 * Awareness card for an encrypted community invite link (Concord CORD-05,
 * kind 33301) posted in a note. The invite bundle's content is NIP-44
 * encrypted and its unlock key lives only in the URL `#fragment`, so Ditto
 * — which isn't an encrypted-community client — can't preview or join it.
 * Rather than fetch the bundle and render encrypted gibberish through the
 * generic naddr embed, we recognize the link and offer to open it in a
 * compatible app. Mirrors Armada's own invite card so a link reads as an
 * invitation rather than an opaque URL.
 */
export function ArmadaInviteEmbed({ invite, className }: ArmadaInviteEmbedProps) {
  const safeUrl = sanitizeUrl(invite.openUrl);
  return (
    <div
      className={cn(
        'block max-w-sm w-full rounded-2xl border border-border bg-secondary/30 overflow-hidden my-2.5',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3.5 py-3 space-y-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Community invite
        </p>

        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ShieldCheck className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">Encrypted community</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {invite.missingSecret
                ? "This invite is missing its secret (the part after #)."
                : 'Open in a compatible app to view and join.'}
            </p>
          </div>
        </div>

        {invite.missingSecret ? (
          <Button variant="secondary" className="w-full" disabled>
            Invite incomplete
          </Button>
        ) : (
          <Button
            className="w-full"
            disabled={!safeUrl}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (safeUrl) openUrl(safeUrl);
            }}
          >
            <ExternalLink className="size-4" />
            Open invite
          </Button>
        )}
      </div>
    </div>
  );
}
