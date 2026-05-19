import { useState } from 'react';
import { Users, Zap } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ZapDialog } from '@/components/ZapDialog';
import { ZapAllOnchainDialog } from '@/components/ZapAllOnchainDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { isPeopleListKind, parsePeopleList } from '@/lib/packUtils';

interface ZapMenuProps {
  event: NostrEvent;
  /**
   * The lightning-icon button. Use a render-prop to receive the `isZapped`
   * state (matches the pattern in {@link RepostMenu}). The button itself
   * doesn't need an onClick — the menu wires it up.
   */
  children: React.ReactNode | ((isZapped: boolean) => React.ReactNode);
  /** Whether the current user has already zapped this event (fills the icon). */
  isZapped: boolean;
}

/**
 * Wrapper around the lightning-icon zap button.
 *
 * - For regular posts (single-recipient zaps), behaves exactly like the
 *   underlying {@link ZapDialog}: clicking the icon opens the existing
 *   zap dialog.
 * - For people-list events (kind 3, 30000, 39089), the icon instead opens
 *   a small popover with two choices: **Zap author** (opens ZapDialog) and
 *   **Zap all members** (opens {@link ZapAllOnchainDialog}, an on-chain-only
 *   batch zap that pays every list member in a single Bitcoin transaction).
 *
 * Mirrors the trigger render-prop pattern used by RepostMenu so PostActionBar
 * can supply its existing styled icon button as the trigger.
 */
export function ZapMenu({ event, children, isZapped }: ZapMenuProps) {
  const { user } = useCurrentUser();
  const { canSignPsbt } = useBitcoinSigner();
  const [menuOpen, setMenuOpen] = useState(false);
  const [zapAllOpen, setZapAllOpen] = useState(false);
  const [zapAuthorOpen, setZapAuthorOpen] = useState(false);

  const trigger = typeof children === 'function' ? children(isZapped) : children;

  // Parse list members up-front so we know whether to render the "Zap all"
  // option at all. Filters the sender out (you can't zap yourself).
  const isListEvent = isPeopleListKind(event.kind);
  const listMembers = isListEvent
    ? parsePeopleList(event).pubkeys.filter((pk) => pk !== user?.pubkey)
    : [];

  // You can't zap your own event, so hide the "Zap author" row when the
  // viewer authored this list. (The "Zap all members" row is still useful
  // because the viewer can pay every OTHER member of their own list.)
  const canZapAuthor = !!user && user.pubkey !== event.pubkey;

  // Only show the menu when there are actually multiple actions to choose
  // from. For ordinary posts, fall back to the original direct-to-dialog
  // behavior.
  const showMenu = isListEvent && listMembers.length > 0 && canSignPsbt;

  if (!showMenu) {
    return <ZapDialog target={event}>{trigger}</ZapDialog>;
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent
          className="w-56 p-0 rounded-xl overflow-hidden"
          align="end"
          side="top"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full">
            {/*
             * "Zap author" opens the existing ZapDialog. Nesting a Radix
             * Dialog inside this Popover causes the dialog's dismiss layer
             * to inherit the popover's pending dismiss and close itself
             * instantly. Instead, control the ZapDialog from the outside
             * and defer opening it via queueMicrotask after the popover
             * unmounts — same fix as the Zap all row and FollowAllSplitButton.
             *
             * Hidden when the viewer authored this list (can't zap yourself).
             */}
            {canZapAuthor && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  queueMicrotask(() => setZapAuthorOpen(true));
                }}
                className="flex items-center gap-3 w-full px-4 py-3 text-[15px] text-foreground hover:bg-secondary/60 transition-colors"
              >
                <Zap className="size-5" />
                <span>Zap author</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                // Defer opening so the popover's dismiss layer unmounts
                // first, otherwise the dialog inherits `pointer-events: none`
                // from Radix (same fix as FollowAllSplitButton).
                queueMicrotask(() => setZapAllOpen(true));
              }}
              className={`flex items-center gap-3 w-full px-4 py-3 text-[15px] text-foreground hover:bg-secondary/60 transition-colors${
                canZapAuthor ? ' border-t border-border' : ''
              }`}
            >
              <Users className="size-5" />
              <span>Zap all members</span>
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <ZapDialog
        target={event}
        open={zapAuthorOpen}
        onOpenChange={setZapAuthorOpen}
      />

      <ZapAllOnchainDialog
        recipientPubkeys={listMembers}
        target={event}
        open={zapAllOpen}
        onOpenChange={setZapAllOpen}
      />
    </>
  );
}
