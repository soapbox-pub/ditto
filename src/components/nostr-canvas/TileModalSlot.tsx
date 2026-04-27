/**
 * Renders the nostr-canvas modal dialog requested via `ctx.show_modal`.
 *
 * The library delivers one modal request at a time via `useNostrCanvas().modal`.
 * We render its `body` — a `TileOutput` tree — using the shared `TileView`,
 * and pass the user's answer back through `modal.respond(confirmed)`.
 *
 * Form-field collection (`modal.respond(confirmed, fields)`) is not
 * supported by our renderer — tile modals that require form input will
 * receive `{confirmed: boolean, fields: undefined}` which the library
 * still delivers correctly.
 */

import { memo } from 'react';
import { useNostrCanvas } from '@soapbox.pub/nostr-canvas/react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TileView } from '@/components/nostr-canvas/TileView';

export const TileModalSlot = memo(function TileModalSlot() {
  const { modal } = useNostrCanvas();

  if (!modal) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) modal.respond(false);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{modal.title}</DialogTitle>
        </DialogHeader>

        <div className="py-2">
          <TileView output={modal.body} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => modal.respond(false)}>
            {modal.cancelLabel}
          </Button>
          <Button onClick={() => modal.respond(true)}>
            {modal.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
