import { lazy, Suspense, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Plus, X } from 'lucide-react';

import { CustomEmojiImg } from '@/components/CustomEmoji';
import type { EmojiSelection } from '@/components/EmojiPicker';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCustomEmojis } from '@/hooks/useCustomEmojis';
import { useFeedSettings } from '@/hooks/useFeedSettings';
import { usePublishQuickReactions } from '@/hooks/useQuickReactionList';
import { usePinnedQuickReactions, useQuickReactions, type QuickReactionSlot as Slot } from '@/hooks/useQuickReactions';
import { toast } from '@/hooks/useToast';
import { isCustomEmoji } from '@/lib/customEmoji';
import type { ListedQuickReaction as QuickReaction } from '@/lib/quickReactions';
import { MAX_QUICK_REACTIONS } from '@/lib/schemas';
import {
  arrayMove,
  CSS,
  DndContext,
  horizontalListSortingStrategy,
  KeyboardSensor,
  PointerSensor,
  SortableContext,
  useSensor,
  useSensors,
  useSortable,
  type DragEndEvent,
} from '@/lib/sortable';
import { cn } from '@/lib/utils';

const EmojiPicker = lazy(() => import('@/components/EmojiPicker').then(m => ({ default: m.EmojiPicker })));

/**
 * The quick-react row as it appears under the react button. Slots the user
 * hasn't chosen show the most-used emoji filling them, faded. Choosing an
 * emoji for any slot locks in the whole row as shown, so what's on screen is
 * what the menu offers; removing one hands that slot back to usage. Dragging
 * a slot (or arrow keys on it) reorders the row, pinning it the same way.
 */
export function QuickReactionsSection() {
  const intl = useIntl();
  const { updateConfig } = useAppContext();
  const { user } = useCurrentUser();
  const { pinned, list } = usePinnedQuickReactions();
  const publish = usePublishQuickReactions();
  const slots = useQuickReactions();

  // The publish checks the relays against the list this row was built from.
  const ready = !user || (list !== undefined && !publish.isPending);
  const hasPinned = pinned.length > 0;
  const hasAuto = slots.length < MAX_QUICK_REACTIONS || slots.some((s) => !s.pinned);

  const row = useMemo(
    () => slots.map(({ emoji, url, set }): QuickReaction => (url ? (set ? { emoji, url, set } : { emoji, url }) : { emoji })),
    [slots],
  );

  /**
   * Save `next` as the whole list. Pins the row can't show (custom emojis while
   * they're hidden, or more than fit) ride along at the end rather than being
   * dropped from a list other apps share — unless `clearUnseen`, for Reset.
   */
  const save = (next: QuickReaction[], { clearUnseen = false } = {}) => {
    if (!ready) return;
    if (!user) {
      // Signed out there's no list to publish; keep the pins on this device.
      updateConfig((current) => ({ ...current, quickReactions: next }));
      return;
    }
    const shown = new Set(row.map((r) => r.emoji));
    const kept = new Set(next.map((r) => r.emoji));
    const unseen = clearUnseen ? [] : pinned.filter((r) => !shown.has(r.emoji) && !kept.has(r.emoji));
    publish
      .mutateAsync({ reactions: [...next, ...unseen], basis: list?.id ?? null })
      .catch((error: unknown) => {
        toast({
          title: intl.formatMessage({ id: 'settings.content.quickReactionsSaveFailed', defaultMessage: "Couldn't save quick reactions" }),
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      });
  };

  const ids = useMemo(() => slots.map((s) => s.emoji), [slots]);

  // A short move threshold, so a tap still opens the picker.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const from = ids.indexOf(active.id);
    const to = ids.indexOf(over.id);
    if (from === -1 || to === -1 || from === to) return;
    save(arrayMove(row, from, to));
  };

  /** Put `reaction` in slot `at` and pin the row, dropping it from any other slot. */
  const pick = (at: number, reaction: QuickReaction) => {
    const next = at < row.length ? row.map((r, i) => (i === at ? reaction : r)) : [...row, reaction];
    const index = Math.min(at, row.length);
    save(next.filter((r, i) => i === index || r.emoji !== reaction.emoji).slice(0, MAX_QUICK_REACTIONS));
  };

  const unpin = (emoji: string) => {
    save(pinned.filter((r) => r.emoji !== emoji));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium"><FormattedMessage id="settings.content.quickReactions" defaultMessage="Quick reactions" /></Label>
          <p className="text-xs text-muted-foreground">
            <FormattedMessage id="settings.content.quickReactionsDescription" defaultMessage="The emojis offered when you tap the react button. Tap one to swap it, or drag to reorder." />
          </p>
        </div>
        {hasPinned && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs text-muted-foreground hover:text-foreground"
            disabled={!ready}
            onClick={() => save([], { clearUnseen: true })}
          >
            <FormattedMessage id="settings.content.quickReactionsReset" defaultMessage="Reset" />
          </Button>
        )}
      </div>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
          <div className="flex gap-1.5 sm:gap-2">
            {Array.from({ length: MAX_QUICK_REACTIONS }, (_, i) => (
              <QuickReactionSlot
                key={slots[i]?.emoji ?? `empty-${i}`}
                id={slots[i]?.emoji ?? `empty-${i}`}
                position={i + 1}
                slot={slots[i]}
                disabled={!ready}
                onPick={(reaction) => pick(i, reaction)}
                onUnpin={() => slots[i] && unpin(slots[i].emoji)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {hasAuto && (
        <p className="text-xs text-muted-foreground">
          <FormattedMessage id="settings.content.quickReactionsAuto" defaultMessage="Faded emojis fill in from the ones you use most, and change as you react." />
        </p>
      )}
    </div>
  );
}

interface QuickReactionSlotProps {
  id: string;
  position: number;
  slot?: Slot;
  disabled: boolean;
  onPick: (reaction: QuickReaction) => void;
  onUnpin: () => void;
}

function QuickReactionSlot({ id, position, slot, disabled, onPick, onUnpin }: QuickReactionSlotProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !slot || disabled });
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const { feedSettings } = useFeedSettings();
  const { emojis: allCustomEmojis } = useCustomEmojis();
  const customEmojis = feedSettings.showCustomEmojis !== false ? allCustomEmojis : undefined;

  const handleSelect = (selection: EmojiSelection) => {
    setOpen(false);
    onPick(selection.type === 'native'
      ? { emoji: selection.emoji }
      : { emoji: `:${selection.shortcode}:`, url: selection.url });
  };

  const label = !slot
    ? intl.formatMessage({ id: 'settings.content.quickReactionsAdd', defaultMessage: 'Choose quick reaction {position}' }, { position })
    : slot.pinned
      ? intl.formatMessage({ id: 'settings.content.quickReactionsChange', defaultMessage: 'Change quick reaction {position}' }, { position })
      : intl.formatMessage({ id: 'settings.content.quickReactionsChangeAuto', defaultMessage: 'Change quick reaction {position}, filled in from your most used' }, { position });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('group relative', isDragging && 'z-10')}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            aria-label={label}
            {...attributes}
            {...listeners}
            className={cn(
              'flex size-11 items-center justify-center rounded-full text-2xl transition-[background-color,transform,box-shadow] sm:size-12',
              slot && 'cursor-grab active:cursor-grabbing',
              isDragging && 'scale-110 shadow-lg',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:cursor-default disabled:opacity-60',
              slot ? 'bg-secondary/50 hover:bg-secondary' : 'bg-secondary/30 text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
            )}
          >
            {!slot ? (
              <Plus className="size-5" />
            ) : (
              <span
                className={cn(
                  'flex items-center justify-center leading-none',
                  !slot.pinned && 'opacity-40',
                )}
              >
                {isCustomEmoji(slot.emoji) && slot.url ? (
                  <CustomEmojiImg name={slot.emoji.slice(1, -1)} url={slot.url} className="size-7 object-contain" />
                ) : (
                  slot.emoji
                )}
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 overflow-hidden rounded-xl" align="start">
          <Suspense fallback={<div className="w-[352px] max-w-[90vw] h-[280px] flex items-center justify-center text-sm text-muted-foreground"><FormattedMessage id="settings.content.quickReactionsLoading" defaultMessage="Loading…" /></div>}>
            <EmojiPicker customEmojis={customEmojis} onSelect={handleSelect} recordUsage={false} />
          </Suspense>
        </PopoverContent>
      </Popover>
      {slot?.pinned && !isDragging && (
        <button
          type="button"
          disabled={disabled}
          onClick={onUnpin}
          aria-label={intl.formatMessage({ id: 'settings.content.quickReactionsRemove', defaultMessage: 'Remove quick reaction {position}' }, { position })}
          className={cn(
            'absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-background/80 text-muted-foreground shadow-sm backdrop-blur-sm transition-[color,opacity] hover:bg-background hover:text-destructive',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            // Always shown on touch; on devices that can hover, only while hovering or focused.
            '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100',
          )}
        >
          <X className="size-3.5" strokeWidth={3.5} />
        </button>
      )}
    </div>
  );
}
