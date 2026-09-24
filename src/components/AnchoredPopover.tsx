import { useRef, type ComponentPropsWithoutRef, type RefObject } from 'react';

import { MountOnOpen } from '@/components/MountOnOpen';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';

type Measurable = { getBoundingClientRect(): DOMRect };

interface AnchoredPopoverProps extends ComponentPropsWithoutRef<typeof PopoverContent> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element the popover opens from. It toggles `open` itself. */
  anchorRef: RefObject<HTMLElement | null>;
}

/**
 * A popover that is not built until it first opens, anchored to an element
 * that lives outside it.
 *
 * For popovers owned by every feed row (the reaction and repost menus): a
 * `<Popover>` wrapped around its `<PopoverTrigger>` mounts a popper, an anchor
 * that re-renders to register itself, and presence tracking for every card,
 * although almost none are ever opened. Mounting the Popover on demand around
 * an existing trigger would remount the trigger — under the pointer, for a
 * hover-opened menu — so instead the trigger stays where it is and this
 * renders beside it, pointed at it through a virtual anchor.
 *
 * Covers what `<PopoverTrigger>` would have done: a press on the anchor is not
 * an outside interaction (the anchor's own handler toggles the menu), and
 * focus returns to the anchor on close unless the user interacted elsewhere.
 * The anchor should carry `aria-haspopup="dialog"` and `aria-expanded`.
 */
export function AnchoredPopover({
  open,
  onOpenChange,
  anchorRef,
  onInteractOutside,
  onCloseAutoFocus,
  ...contentProps
}: AnchoredPopoverProps) {
  const interactedOutside = useRef(false);

  return (
    <MountOnOpen open={open}>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverAnchor virtualRef={anchorRef as RefObject<Measurable>} />
        <PopoverContent
          {...contentProps}
          onInteractOutside={(e) => {
            onInteractOutside?.(e);
            if (anchorRef.current?.contains(e.target as Node)) {
              e.preventDefault();
            } else if (!e.defaultPrevented) {
              interactedOutside.current = true;
            }
          }}
          onCloseAutoFocus={(e) => {
            onCloseAutoFocus?.(e);
            if (!e.defaultPrevented) {
              if (!interactedOutside.current) anchorRef.current?.focus();
              e.preventDefault();
            }
            interactedOutside.current = false;
          }}
        />
      </Popover>
    </MountOnOpen>
  );
}
