import type { NostrEvent } from '@nostrify/nostrify';
import { Check, Loader2, RotateCcw } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatVersionDate } from '@/lib/versionHistory';

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description: React.ReactNode;
  children: React.ReactNode;
}

/** Shell shared by every version-history dialog. The body scrolls; the header stays put. */
export function VersionHistoryDialog({ open, onOpenChange, title, description, children }: VersionHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85dvh] flex flex-col gap-0 p-0 rounded-2xl overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 pr-12 shrink-0 text-left">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

/** Scrolling body of a version-history dialog. */
export function VersionHistoryBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex-1 min-h-0 overflow-y-auto pb-3', className)}>{children}</div>;
}

export function VersionList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-border-subtle">{children}</ul>;
}

interface VersionRowProps {
  event: NostrEvent;
  isCurrent: boolean;
  isRestoring: boolean;
  /** Another row is restoring; hold this one still until it finishes. */
  disabled: boolean;
  onRestore: () => void;
  /** Avatar, swatch, or icon at the start of the row. */
  leading?: React.ReactNode;
  children?: React.ReactNode;
}

/** One saved version: a summary, when it was saved, and either a Current pill or a Restore button. */
export function VersionRow({ event, isCurrent, isRestoring, disabled, onRestore, leading, children }: VersionRowProps) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      {leading}
      <div className="min-w-0 flex-1 space-y-1">
        {children}
        <VersionDate event={event} />
      </div>
      <VersionAction isCurrent={isCurrent} isRestoring={isRestoring} disabled={disabled} onRestore={onRestore} />
    </li>
  );
}

export function VersionDate({ event }: { event: NostrEvent }) {
  const intl = useIntl();

  return (
    <p className="text-xs text-muted-foreground">
      <time dateTime={new Date(event.created_at * 1000).toISOString()}>
        {formatVersionDate(event.created_at, intl)}
      </time>
    </p>
  );
}

export function VersionAction({ isCurrent, isRestoring, disabled, onRestore }: Pick<VersionRowProps, 'isCurrent' | 'isRestoring' | 'disabled' | 'onRestore'>) {
  if (isCurrent) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
        <Check className="size-3.5" />
        <FormattedMessage id="muteRecovery.current" defaultMessage="Current" />
      </span>
    );
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      className="h-8 shrink-0 gap-1.5 rounded-full px-3 text-xs"
      onClick={onRestore}
      disabled={disabled || isRestoring}
    >
      {isRestoring ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
      <FormattedMessage id="muteRecovery.restore" defaultMessage="Restore" />
    </Button>
  );
}

export function VersionListSkeleton() {
  return (
    <ul className="divide-y divide-border-subtle" aria-hidden>
      {[1, 2, 3].map((i) => (
        <li key={i} className="flex items-center gap-3 px-5 py-3">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
        </li>
      ))}
    </ul>
  );
}

export function VersionListEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mx-auto max-w-xs px-5 py-12 text-center text-sm text-muted-foreground">{children}</p>
  );
}
