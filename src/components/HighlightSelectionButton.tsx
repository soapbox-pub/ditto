import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import type { NostrEvent } from '@nostrify/nostrify';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTextHighlight, type HighlightSelection } from '@/hooks/useTextHighlight';
import { useCreateHighlight } from '@/hooks/useCreateHighlight';
import { useToast } from '@/hooks/useToast';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToastAction } from '@/components/ui/toast';
import { HighlightContent } from '@/components/HighlightContent';
import { buildHighlightTags } from '@/lib/highlightSource';
import { tryNeventEncode } from '@/lib/safeNip19';
import { cn } from '@/lib/utils';

/** Gap (px) between the selection and the floating button (desktop only). */
const BUTTON_OFFSET = 8;
/** Approximate button dimensions, used to keep it on-screen. */
const BUTTON_WIDTH = 92;
const BUTTON_HEIGHT = 32;
/** Mobile viewport threshold — matches MOBILE_BREAKPOINT in useIsMobile.tsx (Tailwind `md`). */
const MOBILE_BREAKPOINT = 768;

/** True when the device exposes a touch input (may also have a mouse/trackpad). */
const hasTouch = (): boolean =>
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) || (navigator.maxTouchPoints ?? 0) > 0);

/**
 * Renders a "Highlight" affordance near/around any text the user selects inside
 * highlightable Nostr content, and a confirmation dialog that composes a NIP-84
 * (kind 9802) Highlight event referencing the source.
 *
 * Placement avoids competing with the native selection popover:
 *
 * - **Native iOS/Android, or a touch device at a mobile viewport:** a fixed bar
 *   docked at the bottom of the screen, above the mobile nav + safe-area inset.
 *   The OS Copy / Select All / Look Up menu sits near the selection at the top;
 *   the bottom bar stays out of its way and remains thumb-reachable.
 * - **Everything else (desktop, touchscreen laptops, tablets w/ a pointer):** a
 *   small floating button anchored above the selection. There the user selects
 *   with a pointer and no OS selection popover appears, so the anchored button
 *   reads naturally and has nothing to collide with.
 *
 * Note: a bare touch capability is *not* enough to dock at the bottom —
 * touchscreen laptops and pointer-equipped tablets select with a mouse/trackpad
 * and should get the anchored button. We dock only for native mobile or a
 * genuinely small touch viewport.
 *
 * Mount once near the app root.
 */
export function HighlightSelectionButton() {
  const { user } = useCurrentUser();
  const { selection, clear } = useTextHighlight();
  const { toast } = useToast();
  const { mutateAsync: createHighlight, isPending } = useCreateHighlight();
  const { pathname } = useLocation();

  const [touch] = useState(hasTouch);
  const [native] = useState(() => Capacitor.isNativePlatform());

  // Track viewport width directly so placement re-evaluates on every resize.
  // (useIsMobile only updates on matchMedia threshold-crossing events, which
  // could lag a re-render and leave stale placement — the "needs refresh"
  // symptom.) This single source of truth always reflects the current width.
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === 'undefined' ? 0 : window.innerWidth,
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    // Sync once on mount in case the width changed before the listener attached.
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Dock at the bottom (clear of the OS selection menu) only for native
  // iOS/Android, or a touch device that's also at a mobile viewport width.
  // A touchscreen laptop (touch === true but wide viewport) gets the anchored
  // button, matching how its user actually selects text (mouse/trackpad).
  const dockAtBottom = native || (touch && viewportWidth < MOBILE_BREAKPOINT);

  // Snapshot of the selection captured when the user opens the dialog, so it
  // survives the selection being cleared by focus changes.
  const [pending, setPending] = useState<HighlightSelection | null>(null);
  const [comment, setComment] = useState('');

  // Don't offer highlighting to logged-out users — they can't publish.
  const showTrigger = !!user && !!selection && !pending;

  useEffect(() => {
    if (!pending) setComment('');
  }, [pending]);

  // Navigating away (e.g. leaving a post) doesn't reliably clear the DOM text
  // selection, which would leave the trigger stranded on screen over unrelated
  // content. Drop any selection and close the dialog on every route change.
  useEffect(() => {
    window.getSelection()?.removeAllRanges();
    setPending(null);
  }, [pathname]);

  const openDialog = () => {
    if (selection) setPending(selection);
  };

  const closeDialog = () => {
    setPending(null);
    clear();
  };

  const handleSubmit = async () => {
    if (!pending) return;
    try {
      const published = await createHighlight({
        text: pending.text,
        context: pending.context,
        source: pending.source,
        comment,
      });
      const nevent = tryNeventEncode({ id: published.id, author: published.pubkey, kind: published.kind });
      toast({
        title: 'Highlight published',
        action: nevent ? (
          <ToastAction altText="View highlight" asChild>
            <Link to={`/${nevent}`}>View</Link>
          </ToastAction>
        ) : undefined,
      });
      closeDialog();
    } catch (error) {
      toast({
        title: 'Failed to publish highlight',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    }
  };

  // Build a draft highlight event so the dialog previews the highlight with the
  // exact same renderer (HighlightContent) used after publishing — the source
  // note rendered as a quote with the excerpt marked, plus the comment above.
  const previewEvent = useMemo<NostrEvent | null>(() => {
    if (!pending || !user) return null;
    const tags = buildHighlightTags(pending.source, pending.context);
    const trimmedComment = comment.trim();
    if (trimmedComment) tags.push(['comment', trimmedComment]);
    return {
      id: '',
      sig: '',
      kind: 9802,
      pubkey: user.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      content: pending.text,
      tags,
    };
  }, [pending, user, comment]);

  return (
    <>
      {showTrigger && createPortal(
        dockAtBottom
          ? <DockedBar onActivate={openDialog} />
          : <FloatingButton rect={selection.rect} onActivate={openDialog} />,
        document.body,
      )}

      <Dialog open={!!pending} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create highlight</DialogTitle>
          </DialogHeader>

          {previewEvent && (
            <div className="max-h-[40dvh] overflow-y-auto">
              <HighlightContent event={previewEvent} expanded className="mt-0" />
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="highlight-comment" className="text-sm font-medium">
              Add a comment <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              id="highlight-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Why is this worth highlighting?"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending ? 'Publishing...' : 'Highlight'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Touch placement: a bar docked at the bottom of the screen, above the mobile
 * nav and safe-area inset, clear of the native selection popover at the top.
 *
 * Uses `onPointerUp` (not `onPointerDown` + `preventDefault`) so we don't
 * interfere with the native selection-handle drag gesture. We stop propagation
 * so the tap doesn't clear the selection before the handler runs.
 */
function DockedBar({ onActivate }: { onActivate: () => void }) {
  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        // Clear the floating mobile bottom nav + safe area, matching the FAB's
        // offset (.bottom-fab = 1.5rem + nav height + safe area).
        bottom: 'calc(1.5rem + var(--bottom-nav-height, 0px) + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)))',
        zIndex: 45,
      }}
      className="flex justify-center px-4 pointer-events-none"
    >
      <button
        type="button"
        onPointerUp={(e) => {
          e.stopPropagation();
          onActivate();
        }}
        className="pointer-events-auto inline-flex items-center justify-center rounded-full bg-primary/90 px-6 py-2.5 text-sm font-semibold text-primary-foreground opacity-95 shadow-xl ring-1 ring-black/10 backdrop-blur-md transition-all hover:bg-primary hover:opacity-100 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
      >
        Highlight
      </button>
    </div>
  );
}

/**
 * Desktop placement: a small button anchored above the selection. No OS
 * selection popover exists on desktop, so there is nothing to collide with.
 */
function FloatingButton({ rect, onActivate }: { rect: DOMRect; onActivate: () => void }) {
  // Hide entirely when the selection has scrolled out of the viewport, rather
  // than clamping the button to the top edge where it would hover over
  // unrelated content with the selection no longer visible.
  const fullyAbove = rect.bottom <= 0;
  const fullyBelow = rect.top >= window.innerHeight;
  if (fullyAbove || fullyBelow) {
    return null;
  }

  const top = Math.max(BUTTON_OFFSET, rect.top - BUTTON_HEIGHT - BUTTON_OFFSET);
  const rawLeft = rect.left + rect.width / 2 - BUTTON_WIDTH / 2;
  const left = Math.min(
    Math.max(BUTTON_OFFSET, rawLeft),
    window.innerWidth - BUTTON_WIDTH - BUTTON_OFFSET,
  );

  return (
    <button
      type="button"
      // mousedown fires before the selection is torn down by the focus change.
      onMouseDown={(e) => {
        e.preventDefault();
        onActivate();
      }}
      style={{ position: 'fixed', top, left, zIndex: 60 }}
      className={cn(
        'inline-flex items-center justify-center rounded-full bg-primary/90 px-4 py-1.5 text-sm font-medium text-primary-foreground opacity-95 shadow-lg ring-1 ring-black/10 backdrop-blur-md transition-all hover:scale-105 hover:bg-primary hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200',
      )}
    >
      Highlight
    </button>
  );
}
