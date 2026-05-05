/**
 * RoomFurnitureEditor — Bottom toolbar overlay for editing room furniture.
 *
 * Renders as an absolute overlay within the BlobbiRoomShell.
 *
 * Features: select/move/resize/flip/delete items, change layer, add from
 * catalog, reset to defaults. Save persists to Nostr profile; Cancel discards.
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Trash2,
  FlipHorizontal,
  RotateCcw,
  Minus,
  Armchair,
  Check,
  Upload,
  Link,
  Loader2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

import type { BlobbiRoomId } from '../lib/room-config';
import { ROOM_META } from '../lib/room-config';
import type { FurniturePlacement, FurnitureLayer, FurnitureContent } from '../lib/room-furniture-schema';
import { FURNITURE_LAYERS, MAX_FURNITURE_PER_ROOM } from '../lib/room-furniture-schema';
import { getAvailableFurnitureForRoom, getFurnitureAsset, resolveFurniture, type FurnitureDefinition } from '../lib/furniture-registry';
import { DEFAULT_ROOM_FURNITURE } from '../lib/room-furniture-defaults';

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoomFurnitureEditorProps {
  roomId: BlobbiRoomId;
  draft: FurniturePlacement[];
  onDraftChange: (draft: FurniturePlacement[]) => void;
  selectedIndex: number | null;
  onSelectItem: (index: number | null) => void;
  /** Cancel — discard draft and close. */
  onClose: () => void;
  /** Save — persist the current draft. */
  onSave: () => void;
  /** Whether persistence is in flight. */
  isSaving?: boolean;
  /**
   * Placement hint: 'top' renders toolbar near the top (below the sub-header),
   * 'bottom' renders near the bottom (above footer/nav). Derived from the
   * selected item's y position by the parent.
   */
  placement?: 'top' | 'bottom';
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
  onSave,
  isSaving = false,
  placement = 'bottom',
}: RoomFurnitureEditorProps) {
  const [showCatalog, setShowCatalog] = useState(false);

  // Close catalog when placement flips to avoid it jumping across the screen
  useEffect(() => {
    setShowCatalog(false);
  }, [placement]);

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

  const handleContentChange = useCallback((content: FurnitureContent | undefined) => {
    if (selectedIndex === null) return;
    const newDraft = draft.map((item, i) => {
      if (i !== selectedIndex) return item;
      if (!content) {
        const { content: _removed, ...rest } = item;
        return rest;
      }
      return { ...item, content };
    });
    onDraftChange(newDraft);
  }, [draft, selectedIndex, onDraftChange]);

  return (
    <div className={cn(
      'absolute inset-x-0 z-[55] pointer-events-none',
      placement === 'top' ? 'top-0' : 'bottom-0',
    )}>
      {/* Catalog overlay */}
      {showCatalog && (
        <div className={cn(
          'absolute inset-x-0 px-3 pointer-events-auto',
          placement === 'top' ? 'top-full mt-2' : 'bottom-full mb-2',
        )}>
          <div className={cn(
            'rounded-2xl border border-border/60 bg-background/95 backdrop-blur-md shadow-xl p-3 max-h-48 overflow-y-auto animate-in fade-in-0 duration-150',
            placement === 'top' ? 'slide-in-from-bottom-2' : 'slide-in-from-top-2',
          )}>
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
      <div className={cn(
        'relative pointer-events-auto px-3',
        placement === 'top'
          ? 'pt-14 pb-2'
          : 'pt-2 pb-4 max-sidebar:pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom,0px)+0.75rem)]',
      )}>
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
            </div>
          </div>

          {/* Placed items strip */}
          {draft.length > 0 && (
            <div className="px-3 pt-1 overflow-x-auto">
              <div className="flex gap-1.5 w-max">
                {draft.map((item, index) => {
                  const def = resolveFurniture(item.id);
                  const asset = def ? getFurnitureAsset(def, item.variant) : undefined;
                  const label = def?.label ?? 'Unknown';
                  const isSelected = index === selectedIndex;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => onSelectItem(index)}
                      aria-label={`Select ${label} (item ${index + 1})`}
                      title={`${label} (${index + 1})`}
                      className={cn(
                        'size-9 shrink-0 rounded-lg flex items-center justify-center border transition-all duration-100',
                        isSelected
                          ? 'ring-2 ring-primary border-primary/60 bg-primary/10'
                          : 'border-border/40 bg-muted/30 hover:bg-accent/50',
                      )}
                    >
                      {asset ? (
                        <img src={asset} alt={label} className="size-6 object-contain" draggable={false} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">?</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

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

              {/* Frame image controls — only shown for picture frames */}
              {selectedDef?.isFrame && (
                <FrameImageControls
                  key={selectedIndex}
                  imageUrl={selectedItem.content?.imageUrl}
                  onImageChange={(url) => {
                    if (url) {
                      const existingContent = selectedItem.content;
                      handleContentChange({ ...existingContent, imageUrl: url });
                    } else {
                      const existing = selectedItem.content;
                      if (existing) {
                        const { imageUrl: _removed, ...rest } = existing;
                        const hasFields = Object.keys(rest).length > 0;
                        handleContentChange(hasFields ? rest : undefined);
                      }
                    }
                  }}
                />
              )}

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
          <div className="px-3 pb-2 pt-1">
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

          {/* Save / Cancel row */}
          <div className="flex items-center gap-2 px-3 pb-2.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 h-8 text-xs"
            >
              <X className="size-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={isSaving}
              className="flex-1 h-8 text-xs"
            >
              {isSaving ? (
                <span className="size-3.5 mr-1 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Check className="size-3.5 mr-1" />
              )}
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Frame Image Controls ─────────────────────────────────────────────────────

interface FrameImageControlsProps {
  imageUrl: string | undefined;
  onImageChange: (url: string | undefined) => void;
}

function FrameImageControls({ imageUrl, onImageChange }: FrameImageControlsProps) {
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pasteValue, setPasteValue] = useState('');
  const [pasteError, setPasteError] = useState(false);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset input so the same file can be re-selected
    e.target.value = '';
    try {
      const [[, url]] = await uploadFile(file);
      onImageChange(url);
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload image.', variant: 'destructive' });
    }
  }, [uploadFile, onImageChange, toast]);

  const handlePasteCommit = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setPasteError(false);
      return;
    }
    const sanitized = sanitizeUrl(trimmed);
    if (sanitized) {
      onImageChange(sanitized);
      setPasteValue('');
      setPasteError(false);
    } else {
      setPasteError(true);
    }
  }, [onImageChange]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-10 shrink-0">Image</span>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* Upload button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="h-6 px-2 text-[10px] gap-1"
          >
            {isUploading ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Upload className="size-3" />
            )}
            {isUploading ? 'Uploading…' : 'Upload'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          {/* Thumbnail preview + clear */}
          {imageUrl && (
            <div className="flex items-center gap-1 min-w-0">
              <img
                src={imageUrl}
                alt=""
                className="size-6 rounded-sm object-cover border border-border/60"
              />
              <button
                type="button"
                onClick={() => onImageChange(undefined)}
                className="size-5 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                aria-label="Remove image"
              >
                <X className="size-3" />
              </button>
            </div>
          )}
        </div>
      </div>
      {/* Paste URL input */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground w-10 shrink-0">
          <Link className="size-3 mx-auto" />
        </span>
        <div className="flex-1 min-w-0">
          <input
            type="url"
            value={pasteValue}
            onChange={(e) => { setPasteValue(e.target.value); setPasteError(false); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handlePasteCommit(pasteValue); }}
            onBlur={() => handlePasteCommit(pasteValue)}
            placeholder="Paste image URL…"
            className={cn(
              'w-full h-6 px-2 text-[10px] rounded-md border bg-muted/30 outline-none',
              'focus:ring-1 focus:ring-primary/50 focus:border-primary/40',
              'placeholder:text-muted-foreground/60',
              pasteError && 'border-destructive/60 focus:ring-destructive/50',
            )}
          />
          {pasteError && (
            <p className="text-[9px] text-destructive mt-0.5">Must be an https:// URL</p>
          )}
        </div>
      </div>
    </div>
  );
}
