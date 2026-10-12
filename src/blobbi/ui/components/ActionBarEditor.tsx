/**
 * ActionBarEditor - Lightweight modal for customizing the bottom action bar.
 *
 * Rules:
 * - Main Action + More are fixed (always shown, not editable)
 * - Up to 3 custom visible slots
 * - User can toggle visibility, reorder, and highlight one item
 */

import { useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import {
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  Star,
  Egg,
  Target,
  Package,
  Camera,
  Footprints,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import {
  type ActionBarPreferences,
  type BarItemId,
  BAR_ITEM_LABELS,
  MAX_VISIBLE_SLOTS,
  toggleSlotVisibility,
  toggleSlotHighlight,
  moveSlotUp,
  moveSlotDown,
  visibleCount,
  DEFAULT_PREFERENCES,
} from '../lib/action-bar-preferences';

// ─── Icon Mapping ─────────────────────────────────────────────────────────────

const BAR_ITEM_ICONS: Record<BarItemId, React.ReactNode> = {
  blobbies: <Egg className="size-4" />,
  missions: <Target className="size-4" />,
  items: <Package className="size-4" />,
  take_photo: <Camera className="size-4" />,
  set_companion: <Footprints className="size-4" />,
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ActionBarEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preferences: ActionBarPreferences;
  onUpdate: (prefs: ActionBarPreferences) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ActionBarEditor({
  open,
  onOpenChange,
  preferences,
  onUpdate,
}: ActionBarEditorProps) {
  const intl = useIntl();
  const currentVisible = visibleCount(preferences);
  const atMax = currentVisible >= MAX_VISIBLE_SLOTS;

  const handleToggle = useCallback(
    (id: BarItemId) => onUpdate(toggleSlotVisibility(preferences, id)),
    [preferences, onUpdate],
  );

  const handleHighlight = useCallback(
    (id: BarItemId) => onUpdate(toggleSlotHighlight(preferences, id)),
    [preferences, onUpdate],
  );

  const handleUp = useCallback(
    (id: BarItemId) => onUpdate(moveSlotUp(preferences, id)),
    [preferences, onUpdate],
  );

  const handleDown = useCallback(
    (id: BarItemId) => onUpdate(moveSlotDown(preferences, id)),
    [preferences, onUpdate],
  );

  const handleReset = useCallback(
    () => onUpdate(DEFAULT_PREFERENCES),
    [onUpdate],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
        <DialogHeader>
          <DialogTitle className="text-base"><FormattedMessage id="actionBarEditor.title" defaultMessage="Edit Action Bar" /></DialogTitle>
          <DialogDescription className="text-xs">
            <FormattedMessage
              id="actionBarEditor.description"
              defaultMessage="Choose up to {max} items. Main Action and More are always shown."
              values={{ max: MAX_VISIBLE_SLOTS }}
            />
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2">
          {preferences.slots.map((slot, idx) => {
            const isFirst = idx === 0;
            const isLast = idx === preferences.slots.length - 1;
            const canTurnOn = slot.visible || !atMax;

            return (
              <div
                key={slot.id}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 transition-colors',
                  slot.visible
                    ? 'bg-accent/60'
                    : 'bg-muted/30 opacity-60',
                )}
              >
                {/* Icon + Label */}
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {BAR_ITEM_ICONS[slot.id]}
                  <span className="text-sm font-medium truncate">
                    <FormattedMessage {...BAR_ITEM_LABELS[slot.id]} />
                  </span>
                </div>

                {/* Highlight toggle */}
                {slot.visible && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn('size-7', slot.highlighted && 'text-amber-500')}
                    onClick={() => handleHighlight(slot.id)}
                    title={slot.highlighted
                      ? intl.formatMessage({ id: 'actionBarEditor.removeHighlight', defaultMessage: 'Remove highlight' })
                      : intl.formatMessage({ id: 'actionBarEditor.highlight', defaultMessage: 'Highlight' })}
                  >
                    <Star className={cn('size-3.5', slot.highlighted && 'fill-current')} />
                  </Button>
                )}

                {/* Reorder controls */}
                <div className="flex flex-col">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    disabled={isFirst}
                    onClick={() => handleUp(slot.id)}
                  >
                    <ChevronUp className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    disabled={isLast}
                    onClick={() => handleDown(slot.id)}
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                </div>

                {/* Visibility toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  disabled={!canTurnOn && !slot.visible}
                  onClick={() => handleToggle(slot.id)}
                  title={slot.visible
                    ? intl.formatMessage({ id: 'actionBarEditor.hide', defaultMessage: 'Hide' })
                    : intl.formatMessage({ id: 'actionBarEditor.show', defaultMessage: 'Show' })}
                >
                  {slot.visible ? (
                    <Eye className="size-3.5" />
                  ) : (
                    <EyeOff className="size-3.5" />
                  )}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Slot counter + reset */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-xs text-muted-foreground">
            <FormattedMessage
              id="actionBarEditor.slotsUsed"
              defaultMessage="{used}/{max} slots used"
              values={{ used: currentVisible, max: MAX_VISIBLE_SLOTS }}
            />
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={handleReset}
          >
            <FormattedMessage id="actionBarEditor.reset" defaultMessage="Reset to default" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
