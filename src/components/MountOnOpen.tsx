import { useState, type ReactNode } from 'react';

/**
 * Renders `children` only once `open` has been true, then keeps them mounted.
 *
 * For dialogs and menus owned by every feed row: a closed Radix dialog still
 * mounts its root, portal and presence tracking, and the component around it
 * still runs its hooks (queries included). A card carries several of these —
 * reply, quote, the more-menu and everything it opens — and almost none are
 * ever opened. Latched rather than tied to `open`, so a closing dialog still
 * animates out and anything it started (a mutation's toast, a follow-up
 * dialog) survives it.
 */
export function MountOnOpen({ open, children }: { open: boolean; children: ReactNode }) {
  const [opened, setOpened] = useState(open);
  if (open && !opened) setOpened(true);
  return opened ? children : null;
}
