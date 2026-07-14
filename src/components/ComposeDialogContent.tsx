import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';

import { DialogOverlay, DialogPortal } from '@/components/ui/dialog';
import { useVisualViewportVar } from '@/hooks/useVisualViewportVar';
import { cn } from '@/lib/utils';

/**
 * Null-rendering child that keeps `--visual-viewport-height` up to date.
 * Rendered *inside* the Radix content so the visualViewport listener is only
 * active while the dialog is actually open (Radix unmounts children on close).
 */
function VisualViewportVar() {
  useVisualViewportVar();
  return null;
}

interface ComposeDialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  ref?: React.Ref<HTMLDivElement>;
}

/**
 * Dialog content for composers (posts, replies, photos).
 *
 * - **Mobile (< sm):** a full-screen sheet pinned to the top of the screen and
 *   sized to the *visual* viewport, so the composer's action bar always sits
 *   right above the virtual keyboard instead of being covered by it.
 * - **Desktop (≥ sm):** the familiar centered 520px card.
 */
export function ComposeDialogContent({ className, children, ref, ...props }: ComposeDialogContentProps) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          // Shared
          'fixed z-[250] flex flex-col overflow-hidden bg-background border-border shadow-lg duration-200',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0',
          // Mobile: full-screen sheet pinned to the top, sized to the visual
          // viewport (shrinks with the keyboard), safe-area aware, sliding up
          // from the bottom like a native modal.
          'left-0 top-0 h-[var(--visual-viewport-height,100dvh)] w-full',
          'pt-[var(--safe-area-inset-top,env(safe-area-inset-top,0px))] pb-[var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px))]',
          'data-[state=open]:slide-in-from-bottom-8 data-[state=closed]:slide-out-to-bottom-8',
          // Desktop: centered card
          'sm:left-1/2 sm:top-1/2 sm:h-auto sm:max-h-[85dvh] sm:w-[calc(100%-2rem)] sm:max-w-[520px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:pt-0 sm:pb-0',
          'sm:data-[state=open]:zoom-in-95 sm:data-[state=closed]:zoom-out-95',
          'sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%]',
          className,
        )}
        {...props}
      >
        <VisualViewportVar />
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}
