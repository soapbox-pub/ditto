/**
 * BlobbiSocialActions — Popover-based social interaction button for a Blobbi.
 *
 * Renders an inline action-bar button (HandHeart icon) that opens a compact
 * popover with a two-step flow:
 *   1. Action pills: feed, play, clean, medicate
 *   2. Item carousel: horizontal carousel for the selected action
 *
 * Clicking an item publishes a kind 1124 interaction event, shows a brief
 * "Sent!" confirmation, then returns to the same carousel with the last-used
 * item still focused — allowing rapid repeated interactions without re-navigating.
 *
 * The popover only closes when the user explicitly dismisses it (click outside,
 * close button, or navigation away).
 *
 * No kind 31124 mutation is ever performed from this surface.
 * Requires a logged-in user — renders nothing when logged out.
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { HandHeart } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { toast } from '@/hooks/useToast';
import { parseBlobbiEvent } from '@/blobbi/core/lib/blobbi';
import {
  buildInteractionEventTemplate,
  type InteractionAction,
} from '@/blobbi/core/lib/blobbi-interaction';
import { useBlobbiInteractions } from '@/blobbi/core/hooks/useBlobbiInteractions';
import {
  ACTION_METADATA,
  ACTION_TO_ITEM_TYPE,
  SHELL_REPAIR_KIT_ID,
  hasMedicineEffectForEgg,
  hasHygieneEffectForEgg,
  hasHappinessEffectForEgg,
  type InventoryAction,
} from '@/blobbi/actions/lib/blobbi-action-utils';
import { getLiveShopItems } from '@/blobbi/shop/lib/blobbi-shop-items';
import { ItemCarousel, type CarouselEntry } from '@/blobbi/rooms/components/ItemCarousel';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default source tag value when the component is used on the Blobbi detail/naddr page. */
const DEFAULT_SOURCE = 'blobbi-view';

/**
 * Supported social actions on the view page.
 * Maps InventoryAction to the 1124 InteractionAction name.
 */
const SOCIAL_ACTIONS: { inventory: InventoryAction; interaction: InteractionAction }[] = [
  { inventory: 'feed', interaction: 'feed' },
  { inventory: 'play', interaction: 'play' },
  { inventory: 'clean', interaction: 'clean' },
  { inventory: 'medicine', interaction: 'medicate' },
];

/** Delay (ms) the "Sent!" state is visible before returning to the carousel. */
const SUCCESS_DISPLAY_DELAY = 1200;

// ─── Panel States ─────────────────────────────────────────────────────────────

type PanelStep =
  | { step: 'actions' }
  | { step: 'carousel'; action: InventoryAction }
  | { step: 'pending'; action: InventoryAction; itemId: string }
  | { step: 'success'; action: InventoryAction };

const INITIAL_STEP: PanelStep = { step: 'actions' };

// ─── Component ────────────────────────────────────────────────────────────────

interface BlobbiSocialActionsProps {
  /** The kind 31124 event of the viewed Blobbi. */
  event: NostrEvent;
  /**
   * Source tag for the kind 1124 event. Convention: `'blobbi-view'` (detail page),
   * `'blobbi-feed'` (feed card). Defaults to `'blobbi-view'`.
   */
  source?: string;
  /**
   * Callback fired after a social interaction is successfully published.
   * Receives the inventory action that was performed (feed, play, clean, medicine).
   */
  onInteractionSuccess?: (action: InventoryAction) => void;
  /**
   * Pre-parsed companion — avoids redundant `parseBlobbiEvent` when the
   * parent already parsed the event for gating purposes.
   */
  companion?: ReturnType<typeof parseBlobbiEvent>;
  /** Extra classes on the trigger button. */
  className?: string;
}

export function BlobbiSocialActions({ event, source = DEFAULT_SOURCE, onInteractionSuccess, companion: companionProp, className }: BlobbiSocialActionsProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const parsedCompanion = useMemo(() => companionProp !== undefined ? companionProp : parseBlobbiEvent(event), [event, companionProp]);
  const companion = parsedCompanion;

  // Pending interaction count since last checkpoint.
  // useBlobbiInteractions already applies the checkpoint `since` filter,
  // so interactions.length represents unprocessed interactions.
  const { interactions, isLoading: interactionsLoading, isError: interactionsError } = useBlobbiInteractions(companion ?? null);
  const pendingCount = (!interactionsLoading && !interactionsError) ? interactions.length : 0;

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<PanelStep>(INITIAL_STEP);

  // Track the last item used so we can restore carousel position after success.
  const lastUsedItemRef = useRef<string | null>(null);

  // Timer for returning from success state to carousel.
  const returnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (returnTimer.current) clearTimeout(returnTimer.current);
    };
  }, []);

  // Reset panel state when popover closes (user dismissal).
  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) {
      setPanel(INITIAL_STEP);
      lastUsedItemRef.current = null;
      if (returnTimer.current) {
        clearTimeout(returnTimer.current);
        returnTimer.current = null;
      }
    }
  }, []);

  /** After success feedback, return to the carousel for the same action. */
  const scheduleReturnToCarousel = useCallback((action: InventoryAction) => {
    if (returnTimer.current) clearTimeout(returnTimer.current);
    returnTimer.current = setTimeout(() => {
      setPanel({ step: 'carousel', action });
    }, SUCCESS_DISPLAY_DELAY);
  }, []);

  // ── Handlers ──

  const handleSelectAction = useCallback((action: InventoryAction) => {
    setPanel({ step: 'carousel', action });
  }, []);

  const handleBack = useCallback(() => {
    setPanel(INITIAL_STEP);
  }, []);

  const handleUseItem = useCallback(
    async (itemId: string) => {
      if (!companion || !user) return;

      const currentAction = panel.step === 'carousel' ? panel.action : undefined;
      const mapping = SOCIAL_ACTIONS.find((s) => s.inventory === currentAction);
      if (!mapping) return;

      setPanel({ step: 'pending', action: mapping.inventory, itemId });
      lastUsedItemRef.current = itemId;

      const template = buildInteractionEventTemplate({
        ownerPubkey: companion.event.pubkey,
        blobbiDTag: companion.d,
        action: mapping.interaction,
        source,
        itemId,
      });

      try {
        await publishEvent(template);

        // Invalidate interaction queries so the projected social status
        // and activity history both reflect the just-published event.
        const coordinate = `31124:${companion.event.pubkey}:${companion.d}`;
        queryClient.invalidateQueries({
          queryKey: ['blobbi-interactions', coordinate],
        });
        queryClient.invalidateQueries({
          queryKey: ['blobbi-activity-history', coordinate],
        });

        setPanel({ step: 'success', action: mapping.inventory });
        onInteractionSuccess?.(mapping.inventory);
        scheduleReturnToCarousel(mapping.inventory);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        toast({
          title: 'Interaction failed',
          description: message,
          variant: 'destructive',
        });
        setPanel({ step: 'carousel', action: mapping.inventory });
      }
    },
    [companion, user, panel, publishEvent, queryClient, scheduleReturnToCarousel, source, onInteractionSuccess],
  );

  // ── Carousel entries ──

  const activeAction = (panel.step === 'carousel' || panel.step === 'pending') ? panel.action : undefined;

  const carouselEntries = useMemo<CarouselEntry[]>(() => {
    if (!activeAction || !companion) return [];
    const allowedType = ACTION_TO_ITEM_TYPE[activeAction];
    const isEgg = companion.stage === 'egg';
    const entries: CarouselEntry[] = [];

    for (const shopItem of getLiveShopItems()) {
      if (shopItem.type !== allowedType) continue;
      if (shopItem.id === SHELL_REPAIR_KIT_ID && !isEgg) continue;
      if (isEgg) {
        if (activeAction === 'medicine' && !hasMedicineEffectForEgg(shopItem.effect)) continue;
        if (activeAction === 'clean' && !hasHygieneEffectForEgg(shopItem.effect) && !hasHappinessEffectForEgg(shopItem.effect)) continue;
      }
      entries.push({ id: shopItem.id, icon: <span>{shopItem.icon}</span>, label: shopItem.name });
    }

    return entries;
  }, [activeAction, companion]);

  // ── Guard ──
  if (!user || !companion) return null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 rounded-full transition-colors',
            open
              ? 'text-pink-500 bg-pink-500/10'
              : 'text-muted-foreground hover:text-pink-500 hover:bg-pink-500/10',
            className,
          )}
          title="Interact with Blobbi"
          onClick={(e) => e.stopPropagation()}
        >
          <HandHeart className="size-[18px] sm:size-5" />
          {pendingCount > 0 && (
            <span className="text-sm tabular-nums">{pendingCount}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-2 max-w-[17rem]"
        side="top"
        align="center"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* ── Action pills ── */}
        {panel.step === 'actions' && (
          <div className="grid grid-cols-2 gap-1.5">
            {SOCIAL_ACTIONS.map(({ inventory }) => {
              const meta = ACTION_METADATA[inventory];
              return (
                <button
                  type="button"
                  key={inventory}
                  onClick={() => handleSelectAction(inventory)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg',
                    'text-sm font-medium transition-all duration-150',
                    'bg-muted/50 hover:bg-muted active:scale-95',
                  )}
                >
                  <span className="text-base leading-none">{meta.icon}</span>
                  <span>{meta.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Item carousel ── */}
        {(panel.step === 'carousel' || panel.step === 'pending') && (
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2 w-full">
              <button
                type="button"
                onClick={handleBack}
                disabled={panel.step === 'pending'}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                &larr; Back
              </button>
              <span className="text-sm font-medium ml-auto">
                {activeAction && ACTION_METADATA[activeAction].icon}{' '}
                {activeAction && ACTION_METADATA[activeAction].label}
              </span>
            </div>
            {carouselEntries.length > 0 ? (
              <ItemCarousel
                items={carouselEntries}
                onUse={handleUseItem}
                activeItemId={panel.step === 'pending' ? panel.itemId : null}
                disabled={panel.step === 'pending'}
                initialItemId={lastUsedItemRef.current}
              />
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">
                No items available.
              </p>
            )}
          </div>
        )}

        {/* ── Success ── */}
        {panel.step === 'success' && (
          <div className="flex items-center justify-center gap-1.5 py-2">
            <span className="text-base">{ACTION_METADATA[panel.action].icon}</span>
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Sent!</span>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
