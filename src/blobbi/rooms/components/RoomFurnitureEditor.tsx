/**
 * RoomFurnitureEditor — Bottom toolbar overlay for editing room furniture.
 *
 * Renders as an absolute overlay within the BlobbiRoomShell. Does NOT persist
 * changes — this commit is local-only draft editing with live preview.
 *
 * Features: select/move/resize/flip/delete items, change layer, add from
 * catalog, reset to defaults.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  X,
  Plus,
  Trash2,
  FlipHorizontal,
  RotateCcw,
  Minus,
  Armchair,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { BlobbiRoomId } from '../lib/room-config';
import { ROOM_META } from '../lib/room-config';
import type { FurniturePlacement, FurnitureLayer } from '../lib/room-furniture-schema';
import { FURNITURE_LAYERS, MAX_FURNITURE_PER_ROOM } from '../lib/room-furniture-schema';
import { getAvailableFurnitureForRoom, resolveFurniture, type FurnitureDefinition } from '../lib/furniture-registry';
import { DEFAULT_ROOM_FURNITURE } from '../lib/room-furniture-defaults';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoomFurnitureEditorProps {
  roomId: BlobbiRoomId;
  draft: FurniturePlacement[];
  onDraftChange: (draft: FurniturePlacement[]) => void;
  selectedIndex: number | null;
  onSelectItem: (index: number | null) => void;
  onClose: () => void;
}

// ─── Trigger Button ───────────────────────────────────────────────────────────

export function RoomFurnitureEditorTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="size-9 rounded-full bg-background/70 border border-border/60 shadow-sm backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-background/90"
      aria-label="Edit room furniture"
    >
      <Armchair className="size-4" />
    </Button>
  );
}

// ─── Main Editor ──────────────────────────────────────────────────────────────

export function RoomFurnitureEditor({
  roomId,
  draft,
  onDraftChange,
  selectedIndex,
  onSelectItem,
  onClose,
}: RoomFurnitureEditorProps) {
  const [showCatalog, setShowCatalog] = useState(false);

  const selectedItem = selectedIndex !== null ? draft[selectedIndex] : null;
  const selectedDef = selectedItem ? resolveFurniture(selectedItem.id) : null;
  const roomMeta = ROOM_META[roomId];
  const atLimit = draft.length >= MAX_FURNITURE_PER_ROOM;

  const catalog = useMemo(() => getAvailableFurnitureForRoom(roomId), [roomId]);

  // ─── Actions ───

  const handleAddItem = useCallback((def: FurnitureDefinition) => {
    if (atLimit) return;
    const newItem: FurniturePlacement = {
      id: def.id,
      x: 0.5,
      y: 0.75,
      layer: def.defaultLayer,
      scale: 1,
    };
    const newDraft = [...draft, newItem];
    onDraftChange(newDraft);
    onSelectItem(newDraft.length - 1);
    setShowCatalog(false);
  }, [draft, onDraftChange, onSelectItem, atLimit]);

  const handleRemoveSelected = useCallback(() => {
    if (selectedIndex === null) return;
    const newDraft = draft.filter((_, i) => i !== selectedIndex);
    onDraftChange(newDraft);
    onSelectItem(null);
  }, [draft, selectedIndex, onDraftChange, onSelectItem]);

  const handleFlipSelected = useCallback(() => {
    if (selectedIndex === null) return;
    const newDraft = draft.map((item, i) =>
      i === selectedIndex ? { ...item, flip: !item.flip } : item,
    );
    onDraftChange(newDraft);
  }, [draft, selectedIndex, onDraftChange]);

  const handleLayerChange = useCallback((layer: FurnitureLayer) => {
    if (selectedIndex === null) return;
    const newDraft = draft.map((item, i) =>
      i === selectedIndex ? { ...item, layer } : item,
    );
    onDraftChange(newDraft);
  }, [draft, selectedIndex, onDraftChange]);

  const handleScaleChange = useCallback((delta: number) => {
    if (selectedIndex === null) return;
    const newDraft = draft.map((item, i) => {
      if (i !== selectedIndex) return item;
      const currentScale = item.scale ?? 1;
      const newScale = Math.round(Math.min(2, Math.max(0.5, currentScale + delta)) * 10) / 10;
      return { ...item, scale: newScale };
    });
    onDraftChange(newDraft);
  }, [draft, selectedIndex, onDraftChange]);

  const handleReset = useCallback(() => {
    const defaults = DEFAULT_ROOM_FURNITURE[roomId] ?? [];
    onDraftChange([...defaults]);
    onSelectItem(null);
  }, [roomId, onDraftChange, onSelectItem]);

  const handleDeselect = useCallback(() => {
    onSelectItem(null);
  }, [onSelectItem]);

  return (
    <div className="absolute inset-x-0 bottom-0 z-[55] pointer-events-none">
      {/* Tap backdrop to deselect (covers room area above toolbar) */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onClick={handleDeselect}
      />

      {/* Catalog overlay */}
      {showCatalog && (
        <div className="absolute inset-x-0 bottom-full mb-2 px-3 pointer-events-auto">
          <div className="rounded-2xl border border-border/60 bg-background/95 backdrop-blur-md shadow-xl p-3 max-h-48 overflow-y-auto animate-in fade-in-0 slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground">Add furniture</span>
              <button
                onClick={() => setShowCatalog(false)}
                className="size-6 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {catalog.map((def) => (
                <button
                  key={def.id}
                  onClick={() => handleAddItem(def)}
                  disabled={atLimit}
                  className={cn(
                    'flex flex-col items-center gap-1 p-2 rounded-xl',
                    'border border-border/40 bg-muted/30',
                    'hover:bg-accent/50 hover:border-primary/30',
                    'transition-colors duration-100',
                    'disabled:opacity-40 disabled:pointer-events-none',
                  )}
                >
                  <img
                    src={def.asset}
                    alt={def.label}
                    className="size-8 object-contain"
                    draggable={false}
                  />
                  <span className="text-[9px] text-muted-foreground leading-tight text-center truncate w-full">
                    {def.label}
                  </span>
                </button>
              ))}
            </div>
            {atLimit && (
              <p className="text-[10px] text-destructive mt-2 text-center">
                Maximum {MAX_FURNITURE_PER_ROOM} items reached
              </p>
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="relative pointer-events-auto px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2">
        <div className="rounded-2xl border border-border/60 bg-background/95 backdrop-blur-md shadow-xl">
          {/* Header row */}
          <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
            <div className="flex items-center gap-2">
              <roomMeta.icon className="size-3.5 text-primary" />
              <span className="text-xs font-semibold">Furniture</span>
              <span className="text-[10px] text-muted-foreground">{draft.length}/{MAX_FURNITURE_PER_ROOM}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleReset}
                className="size-7 rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Reset to defaults"
              >
                <RotateCcw className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="size-7 rounded-full text-muted-foreground hover:text-foreground"
                aria-label="Close furniture editor"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>

          {/* Item controls (visible when item selected) */}
          {selectedItem && (
            <div className="px-3 pb-2 pt-1 space-y-2">
              {/* Layer selector */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Layer</span>
                <div className="flex p-0.5 rounded-lg bg-muted/50 flex-1">
                  {FURNITURE_LAYERS.map((layer) => (
                    <button
                      key={layer}
                      type="button"
                      onClick={() => handleLayerChange(layer)}
                      className={cn(
                        'flex-1 py-1 rounded-md text-[10px] font-medium text-center transition-all duration-100',
                        selectedItem.layer === layer
                          ? 'bg-background shadow-sm text-foreground'
                          : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {layer}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale + flip + delete row */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-10 shrink-0">Size</span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleScaleChange(-0.1)}
                    disabled={(selectedItem.scale ?? 1) <= 0.5}
                    className="size-6 rounded-md"
                  >
                    <Minus className="size-3" />
                  </Button>
                  <span className="text-[10px] font-mono w-7 text-center">
                    {((selectedItem.scale ?? 1) * 100).toFixed(0)}%
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleScaleChange(0.1)}
                    disabled={(selectedItem.scale ?? 1) >= 2}
                    className="size-6 rounded-md"
                  >
                    <Plus className="size-3" />
                  </Button>
                </div>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleFlipSelected}
                  disabled={!selectedDef?.flippable}
                  className="size-7 rounded-lg"
                  aria-label="Flip horizontal"
                >
                  <FlipHorizontal className="size-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRemoveSelected}
                  className="size-7 rounded-lg text-destructive hover:text-destructive"
                  aria-label="Remove item"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          )}

          {/* Add button (always visible) */}
          <div className="px-3 pb-2.5 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCatalog(!showCatalog)}
              disabled={atLimit}
              className="w-full gap-1.5 h-8 text-xs"
            >
              <Plus className="size-3.5" />
              Add furniture
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
