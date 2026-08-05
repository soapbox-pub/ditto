import { useCallback, useEffect, useRef, type ReactNode } from 'react';

import { useExplorerArrival } from '@/contexts/ExplorerArrivalContext';
import { cn } from '@/lib/utils';

/**
 * Marks a persistent Explorer surface as the destination of the arrival
 * transition — the place the big central card is travelling to.
 *
 * While the overlay owns the handoff the child is rendered and **laid out**,
 * but not painted (`visibility: hidden` rather than `display: none`). That
 * distinction is the whole trick:
 *
 *  - the destination occupies its real space, so nothing shifts when it appears
 *    and the surrounding page never reflows at handoff; and
 *  - it has a real bounding box, so the overlay can measure exactly where to
 *    fly to instead of guessing at coordinates.
 *
 * It is also inert while hidden (`aria-hidden`, `inert`), so a screen reader or
 * a Tab press can't reach a surface the user cannot see.
 *
 * Outside a provider — in tests, or anywhere the arrival isn't running — this
 * is a transparent pass-through.
 */
export function ExplorerTransitionTarget({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { owning, registerTarget } = useExplorerArrival();
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const setNode = useCallback(
    (node: HTMLDivElement | null) => {
      nodeRef.current = node;
      registerTarget(node);
    },
    [registerTarget],
  );

  // Unregister on unmount so a route change mid-transition leaves the overlay
  // measuring `null` (and taking the safe fallback) rather than a stale rect.
  useEffect(() => () => registerTarget(null), [registerTarget]);

  return (
    <div
      ref={setNode}
      className={cn(owning && 'invisible', className)}
      aria-hidden={owning || undefined}
      // `inert` keeps the hidden destination out of the tab order, so a Tab
      // press can't land on a surface the user cannot see. Cast because the
      // React DOM types in this version don't model the boolean form yet.
      {...({ inert: owning ? true : undefined } as { inert?: boolean })}
    >
      {children}
    </div>
  );
}
