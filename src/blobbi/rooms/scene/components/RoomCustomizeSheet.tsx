// src/blobbi/rooms/scene/components/RoomCustomizeSheet.tsx

/**
 * RoomCustomizeSheet — Lightweight customization UI for the home room POC.
 *
 * Opens as a bottom sheet (mobile) with simple controls for:
 *   - Wall type (paint / wallpaper / brick)
 *   - Floor type (wood / tile / carpet)
 *   - Wall color presets
 *   - Floor color presets (with paired accent colors)
 *   - Theme colors toggle
 *   - Reset to default
 *
 * Each control triggers an immediate save via patchScene().
 * This is intentionally minimal — not a full editor.
 */

import { Loader2, RotateCcw, Paintbrush, Palette } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { WallType, FloorType } from '../types';
import type { RoomScenePatch } from '../hooks/useRoomSceneEditor';

// ─── Preset Data ──────────────────────────────────────────────────────────────

interface ColorPreset {
  label: string;
  color: string;
  accentColor?: string;
}

const WALL_TYPES: { id: WallType; label: string; icon: string }[] = [
  { id: 'paint', label: 'Paint', icon: '🖌️' },
  { id: 'wallpaper', label: 'Wallpaper', icon: '🎨' },
  { id: 'brick', label: 'Brick', icon: '🧱' },
];

const FLOOR_TYPES: { id: FloorType; label: string; icon: string }[] = [
  { id: 'wood', label: 'Wood', icon: '🪵' },
  { id: 'tile', label: 'Tile', icon: '🔲' },
  { id: 'carpet', label: 'Carpet', icon: '🧶' },
];

const WALL_COLORS: ColorPreset[] = [
  { label: 'Cream', color: '#f5f0eb' },
  { label: 'Snow', color: '#f8f8f8' },
  { label: 'Blush', color: '#f5dfe0' },
  { label: 'Sage', color: '#dce5d8' },
  { label: 'Sky', color: '#d6e4ef' },
  { label: 'Lavender', color: '#e2d9ed' },
  { label: 'Peach', color: '#f5dfc9' },
  { label: 'Charcoal', color: '#3d3d3d' },
  { label: 'Navy', color: '#2a3444' },
  { label: 'Terracotta', color: '#c4664a' },
];

const FLOOR_COLORS: ColorPreset[] = [
  { label: 'Oak', color: '#c4a882', accentColor: '#a08060' },
  { label: 'Walnut', color: '#7a5c3e', accentColor: '#5e4530' },
  { label: 'Maple', color: '#d4b896', accentColor: '#b89a78' },
  { label: 'Cherry', color: '#8b4c3b', accentColor: '#6d3a2c' },
  { label: 'Ash', color: '#bfb5a4', accentColor: '#9e9488' },
  { label: 'Slate', color: '#6b7280', accentColor: '#4b5563' },
  { label: 'Marble', color: '#e5e0d8', accentColor: '#c8c0b4' },
  { label: 'Terracotta', color: '#b86b4a', accentColor: '#944f36' },
  { label: 'Seafoam', color: '#7ba69e', accentColor: '#5e8880' },
  { label: 'Plum', color: '#6b4c6e', accentColor: '#523e54' },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface RoomCustomizeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Current raw (unresolved) scene. */
  currentWallType: WallType;
  currentWallColor: string;
  currentFloorType: FloorType;
  currentFloorColor: string;
  currentUseThemeColors: boolean;
  /** Patch callback — triggers save. */
  onPatch: (patch: RoomScenePatch) => Promise<void>;
  /** Reset callback — removes customization. */
  onReset: () => Promise<void>;
  isSaving: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function RoomCustomizeSheet({
  open,
  onOpenChange,
  currentWallType,
  currentWallColor,
  currentFloorType,
  currentFloorColor,
  currentUseThemeColors,
  onPatch,
  onReset,
  isSaving,
}: RoomCustomizeSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[70vh] rounded-t-2xl px-0">
        <SheetHeader className="px-5 pb-2">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Paintbrush className="size-4" />
            Customize Room
            {isSaving && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Changes save automatically
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-full max-h-[calc(70vh-5rem)]">
          <div className="space-y-5 px-5 pb-8">
            {/* ── Theme Colors Toggle ── */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Palette className="size-4 text-muted-foreground" />
                <Label htmlFor="theme-toggle" className="text-sm font-medium">
                  Use theme colors
                </Label>
              </div>
              <Switch
                id="theme-toggle"
                checked={currentUseThemeColors}
                onCheckedChange={(checked) => onPatch({ useThemeColors: checked })}
                disabled={isSaving}
              />
            </div>

            <Separator />

            {/* ── Wall Type ── */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Wall</h4>
              <div className="flex gap-2">
                {WALL_TYPES.map((wt) => (
                  <button
                    key={wt.id}
                    onClick={() => onPatch({ wall: { type: wt.id } })}
                    disabled={isSaving}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-xs font-medium transition-all',
                      'border-2',
                      currentWallType === wt.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="text-lg">{wt.icon}</span>
                    <span>{wt.label}</span>
                  </button>
                ))}
              </div>

              {/* Wall color swatches */}
              {!currentUseThemeColors && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {WALL_COLORS.map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => onPatch({
                        wall: {
                          color: preset.color,
                          ...(preset.accentColor ? { accentColor: preset.accentColor } : {}),
                        },
                      })}
                      disabled={isSaving}
                      className={cn(
                        'size-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95',
                        'shadow-sm',
                        currentWallColor === preset.color
                          ? 'border-primary ring-2 ring-primary/30 scale-110'
                          : 'border-border/50',
                      )}
                      style={{ backgroundColor: preset.color }}
                      title={preset.label}
                    />
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* ── Floor Type ── */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Floor</h4>
              <div className="flex gap-2">
                {FLOOR_TYPES.map((ft) => (
                  <button
                    key={ft.id}
                    onClick={() => onPatch({ floor: { type: ft.id } })}
                    disabled={isSaving}
                    className={cn(
                      'flex-1 flex flex-col items-center gap-1 py-2.5 px-2 rounded-xl text-xs font-medium transition-all',
                      'border-2',
                      currentFloorType === ft.id
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span className="text-lg">{ft.icon}</span>
                    <span>{ft.label}</span>
                  </button>
                ))}
              </div>

              {/* Floor color swatches */}
              {!currentUseThemeColors && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {FLOOR_COLORS.map((preset) => (
                    <button
                      key={preset.color}
                      onClick={() => onPatch({
                        floor: {
                          color: preset.color,
                          ...(preset.accentColor ? { accentColor: preset.accentColor } : {}),
                        },
                      })}
                      disabled={isSaving}
                      className={cn(
                        'size-8 rounded-full border-2 transition-all hover:scale-110 active:scale-95',
                        'shadow-sm',
                        currentFloorColor === preset.color
                          ? 'border-primary ring-2 ring-primary/30 scale-110'
                          : 'border-border/50',
                      )}
                      style={{ backgroundColor: preset.color }}
                      title={preset.label}
                    />
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* ── Reset ── */}
            <Button
              variant="outline"
              size="sm"
              onClick={onReset}
              disabled={isSaving}
              className="w-full gap-2"
            >
              <RotateCcw className="size-3.5" />
              Reset to Default
            </Button>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
