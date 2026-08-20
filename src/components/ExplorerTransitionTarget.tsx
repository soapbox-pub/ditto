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
 * Several of these are mounted at once — the desktop sidebar widget and the
 * mobile Home teaser both use it, and only CSS hides one of them — so this
 * registers itself as a *candidate*. It does not compete to be "the" target and
 * must never assume it is: the provider decides from layout at measurement
 * time. That is also why withdrawal is by element identity rather than by
 * clearing a shared slot; unregistering blindly used to let the CSS-hidden
 * surface cancel the visible one's registration.
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
  const { owning, addTarget, removeTarget } = useExplorerArrival();
  const nodeRef = useRef<HTMLDivElement | null>(null);

  const setNode = useCallback(
    (node: HTMLDivElement | null) => {
      // Withdraw the node this instance registered — only ever its own.
      if (nodeRef.current) removeTarget(nodeRef.current);
      nodeRef.current = node;
      if (node) addTarget(node);
    },
    [addTarget, removeTarget],
  );

  // Withdraw on unmount, so a route change mid-transition can't leave the
  // overlay measuring a detached element. React already calls the callback ref
  // with `null` first; this covers the case where it doesn't get to.
  useEffect(
    () => () => {
      if (nodeRef.current) removeTarget(nodeRef.current);
      nodeRef.current = null;
    },
    [removeTarget],
  );

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
