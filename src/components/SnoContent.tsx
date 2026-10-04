import { lazy, Suspense, useState } from 'react';
import { Box, Loader2, Lock, Rotate3d } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';

import { Skeleton } from '@/components/ui/skeleton';
import { useSnoPreview, useSnoTree } from '@/hooks/useSnoTree';
import { isEncryptedSno } from '@/lib/sno';
import { cn } from '@/lib/utils';

const SnoViewer = lazy(() => import('@/components/SnoViewer'));

interface SnoContentProps {
  event: NostrEvent;
  /** Open straight into the interactive viewer, as on the detail page. */
  expanded?: boolean;
  className?: string;
}

const viewerFallback = (
  <div className="flex aspect-[4/3] items-center justify-center bg-muted">
    <Loader2 className="size-6 animate-spin text-muted-foreground" />
  </div>
);

/**
 * A Simple Nostr Object (kind 33331): a small 3D object carried in the event
 * itself. Feeds show a rendered still and open the interactive viewer on a
 * tap, since every live viewer holds a WebGL context and a browser allows
 * only a handful.
 */
export function SnoContent({ event, expanded, className }: SnoContentProps) {
  const intl = useIntl();
  const { object, root, error, isLoading } = useSnoTree(event);
  const [viewing, setViewing] = useState(!!expanded);

  const preview = useSnoPreview(event.id, root, !viewing);

  const name = object?.name.trim()
    || event.tags.find(([n]) => n === 'name')?.[1]?.trim()
    || intl.formatMessage({ id: 'sno.untitled', defaultMessage: 'Untitled object' });

  // Hidden at a place in cyberspace (DECK-0003 §3.4): only a preview is public.
  if (isEncryptedSno(event)) {
    return (
      <div className={cn('mt-2 flex items-start gap-3 rounded-xl border border-border bg-secondary/30 p-4', className)}>
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
          <Lock className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {event.content.trim() || (
              <FormattedMessage id="sno.encrypted" defaultMessage="This object is encrypted to a place in cyberspace." />
            )}
          </p>
        </div>
      </div>
    );
  }

  if (error || !object) {
    return (
      <div className={cn('mt-2 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground', className)}>
        <FormattedMessage
          id="sno.invalid"
          defaultMessage="This 3D object can't be displayed ({reason})."
          values={{ reason: error ?? 'unreadable' }}
        />
      </div>
    );
  }

  return (
    <div
      className={cn('mt-2 w-full overflow-hidden rounded-xl border border-border bg-card', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {viewing && root ? (
        <Suspense fallback={viewerFallback}>
          <SnoViewer root={root} />
        </Suspense>
      ) : (
        <div className="relative aspect-[4/3] bg-gradient-to-b from-muted/40 to-muted">
          {preview.data ? (
            <img src={preview.data} alt="" className="absolute inset-0 size-full object-contain" />
          ) : isLoading || preview.isLoading ? (
            <Skeleton className="absolute inset-0 rounded-none" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Box className="size-16 text-muted-foreground/50" />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setViewing(true); }}
            disabled={!root}
            className="absolute inset-0 flex items-end justify-center p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={intl.formatMessage({ id: 'fileCard.view3d', defaultMessage: 'View in 3D' })}
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm font-medium shadow-sm backdrop-blur transition-colors hover:bg-background">
              <Rotate3d className="size-4" />
              <FormattedMessage id="fileCard.view3d" defaultMessage="View in 3D" />
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
