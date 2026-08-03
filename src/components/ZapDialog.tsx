/**
 * Lightweight shell around the real zap dialog.
 *
 * The full dialog ({@link ZapDialogImpl}) drags in the on-chain Bitcoin
 * stack (`@scure/btc-signer`, PSBT plumbing, silent payments, QR rendering —
 * ~200 kB raw). Since it's rendered behind the zap button of every feed
 * card, a static import would put all of that in the entry bundle. This
 * shell renders only the trigger and lazy-loads the implementation the
 * first time the dialog is actually opened.
 */
import { lazy, Suspense, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { ZapDialogProps } from '@/components/ZapDialogImpl';

const ZapDialogImpl = lazy(() =>
  import('@/components/ZapDialogImpl').then((m) => ({ default: m.ZapDialogImpl })),
);

/** Addressable kind for fundraising campaigns (see `@/lib/campaign`). */
const CAMPAIGN_KIND = 33863;

export function ZapDialog({
  target,
  children,
  className,
  open: controlledOpen,
  onOpenChange,
}: ZapDialogProps) {
  const { user } = useCurrentUser();

  // Whether the heavy implementation has ever been needed. Once true it
  // stays mounted so reopening is instant and close animations play.
  const [engaged, setEngaged] = useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  // Controlled callers open the dialog from the outside — engage as soon as
  // the open flag first turns true. (Render-phase state update; React
  // immediately re-renders this component before committing.)
  if (open && !engaged) setEngaged(true);

  // Mirrors the impl's canOpenZap: any logged-in user except self-zaps,
  // with campaigns exempt (creators may donate to their own campaign).
  // The impl re-checks with the fully-parsed campaign after loading.
  const canOpenZap = !!user && (target.kind === CAMPAIGN_KIND || user.pubkey !== target.pubkey);

  if (!canOpenZap && !isControlled) {
    // Same as the impl: render the trigger bare so the icon still appears
    // (it just won't open anything).
    return children ? <>{children}</> : null;
  }

  return (
    <>
      {children && (
        <div
          className={`cursor-pointer ${className || ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setEngaged(true);
            if (isControlled) {
              onOpenChange?.(true);
            } else {
              setUncontrolledOpen(true);
            }
          }}
        >
          {children}
        </div>
      )}
      {engaged && (
        <Suspense fallback={null}>
          <ZapDialogImpl
            target={target}
            open={open}
            onOpenChange={isControlled ? onOpenChange : setUncontrolledOpen}
          />
        </Suspense>
      )}
    </>
  );
}
