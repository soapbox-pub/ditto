// src/blobbi/house/items/AddItemSheet.tsx

/**
 * AddItemSheet — Simple bottom sheet for placing builtin items into a room.
 *
 * Phase 1 POC: shows the 3 builtin catalog items as tappable cards.
 * Tapping one creates a new HouseItem instance with a unique instanceId
 * and sensible default position, then calls `onAdd` to persist it.
 *
 * This is intentionally minimal — no categories, no search, no pagination.
 * Future phases will replace this with full inventory integration.
 */

import { Loader2 } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { BUILTIN_ITEMS, type CatalogItem } from './item-catalog';
import { BuiltinItemVisual } from './BuiltinItemVisual';
import type { HouseItem } from '../lib/house-types';

// ─── Default Placement Positions ──────────────────────────────────────────────

/**
 * Sensible default positions per item in the normalized 0..1000 space.
 * Items are placed roughly center-ish, offset slightly so multiples
 * of the same type don't stack exactly on top of each other.
 */
const DEFAULT_POSITIONS: Record<string, { x: number; y: number }> = {
  poster_abstract: { x: 500, y: 400 },
  rug_round: { x: 500, y: 400 },
  plant_potted: { x: 500, y: 400 },
};

/** Small random jitter so duplicate items don't overlap exactly. */
function jitter(base: number, range = 80): number {
  return Math.round(base + (Math.random() - 0.5) * range);
}

// ─── Instance ID Generation ───────────────────────────────────────────────────

let instanceCounter = 0;

function generateInstanceId(roomId: string, catalogId: string): string {
  instanceCounter += 1;
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 6);
  return `${roomId}-${catalogId}-${ts}-${rnd}-${instanceCounter}`;
}

// ─── Build HouseItem from Catalog ─────────────────────────────────────────────

function buildNewItem(roomId: string, catalog: CatalogItem): HouseItem {
  const defaultPos = DEFAULT_POSITIONS[catalog.id] ?? { x: 500, y: 500 };
  return {
    id: catalog.id,
    instanceId: generateInstanceId(roomId, catalog.id),
    kind: 'builtin',
    plane: catalog.plane,
    layer: catalog.layer,
    position: {
      x: jitter(defaultPos.x),
      y: jitter(defaultPos.y),
    },
    scale: 1,
    rotation: 0,
    visible: true,
  };
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AddItemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomId: string;
  onAdd: (item: HouseItem) => Promise<void>;
  isSaving: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AddItemSheet({ open, onOpenChange, roomId, onAdd, isSaving }: AddItemSheetProps) {
  const catalogEntries = Object.values(BUILTIN_ITEMS);

  const handlePlace = async (catalog: CatalogItem) => {
    const item = buildNewItem(roomId, catalog);
    await onAdd(item);
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[50vh]">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">Add Furniture</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Tap an item to place it in the room
          </SheetDescription>
        </SheetHeader>

        <div className="grid grid-cols-3 gap-3 pb-4">
          {catalogEntries.map((catalog) => (
            <button
              key={catalog.id}
              onClick={() => handlePlace(catalog)}
              disabled={isSaving}
              className="flex flex-col items-center gap-2 p-3 rounded-xl border border-border/50 bg-muted/30 hover:bg-muted/60 active:scale-95 transition-all disabled:opacity-50 disabled:pointer-events-none"
            >
              <div className="w-14 h-14 flex items-center justify-center">
                {isSaving ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                ) : (
                  <BuiltinItemVisual id={catalog.id} />
                )}
              </div>
              <span className="text-[11px] font-medium text-foreground/70 leading-tight text-center">
                {catalog.name}
              </span>
              <span className="text-[9px] text-muted-foreground capitalize">
                {catalog.plane}
              </span>
            </button>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
