/**
 * BlobbiRoomEditor — Centered modal room customization panel.
 *
 * Renders within the BlobbiRoomShell coordinate system (no portal).
 * Uses absolute inset-0 relative to the room's main container so
 * sidebars remain uncovered.
 *
 * Security: all colors validated hex, angle validated 0–359, no arbitrary CSS.
 */

import { useState, useCallback, useMemo } from 'react';
import { Paintbrush, Palette, RotateCcw, Check, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import type { BlobbiRoomId } from '../lib/room-config';
import { ROOM_META } from '../lib/room-config';
import {
  type RoomLayout,
  type RoomSurfaceLayout,
  ROOM_FLOOR_RATIO,
} from '../lib/room-layout-schema';
import { DEFAULT_ROOM_LAYOUTS } from '../lib/room-layout-defaults';
import { getThemeRoomDefaults } from '../lib/room-theme-defaults';
import { getSurfaceBackground } from '../lib/room-surface-background';
import { RoomSurfaceEditor } from './RoomSurfaceEditor';

// ─── Props ────────────────────────────────────────────────────────────────────

interface BlobbiRoomEditorProps {
  roomId: BlobbiRoomId;
  currentLayout: RoomLayout;
  onSave: (roomId: BlobbiRoomId, layout: RoomLayout) => Promise<void> | void;
  onClose?: () => void;
  isSaving?: boolean;
}

// ─── Trigger Button (exported separately for slot usage) ──────────────────────

export function BlobbiRoomEditorTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onClick}
      className="size-9 rounded-full bg-background/70 border border-border/60 shadow-sm backdrop-blur-sm text-muted-foreground hover:text-foreground hover:bg-background/90"
      aria-label="Edit room style"
    >
      <Paintbrush className="size-4" />
    </Button>
  );
}

// ─── Room Preview ─────────────────────────────────────────────────────────────

function RoomPreviewCard({ wall, floor }: { wall: RoomSurfaceLayout; floor: RoomSurfaceLayout }) {
  const wallBg = getSurfaceBackground(wall);
  const floorBg = getSurfaceBackground(floor);

  return (
    <div className="w-full h-24 rounded-xl border border-border/40 overflow-hidden shadow-inner relative">
      {/* Wall */}
      <div
        className="absolute inset-x-0 top-0"
        style={{ background: wallBg, bottom: `${ROOM_FLOOR_RATIO * 100}%` }}
      />
      {/* Floor */}
      <div
        className="absolute inset-x-0 bottom-0"
        style={{ background: floorBg, top: `${(1 - ROOM_FLOOR_RATIO) * 100}%` }}
      />
      {/* Baseboard — shadow/highlight pair at wall/floor boundary */}
      <div
        className="absolute inset-x-0 flex flex-col"
        style={{ top: `${(1 - ROOM_FLOOR_RATIO) * 100}%` }}
      >
        <div className="h-px bg-foreground/10" />
        <div className="h-0.5 bg-background/15" />
      </div>
      {/* Floor depth shadow */}
      <div
        className="absolute inset-x-0 h-2"
        style={{
          top: `${(1 - ROOM_FLOOR_RATIO) * 100}%`,
          background: 'linear-gradient(to bottom, hsl(var(--foreground) / 0.06), transparent)',
        }}
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function BlobbiRoomEditor({
  roomId,
  currentLayout,
  onSave,
  onClose,
  isSaving,
}: BlobbiRoomEditorProps) {
  const [draftWall, setDraftWall] = useState<RoomSurfaceLayout>(currentLayout.wall);
  const [draftFloor, setDraftFloor] = useState<RoomSurfaceLayout>(currentLayout.floor);
  const [activeTab, setActiveTab] = useState<'wall' | 'floor'>('wall');

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleSave = useCallback(async () => {
    if (isSaving) return;
    try {
      await onSave(roomId, { wall: draftWall, floor: draftFloor });
      onClose?.();
    } catch {
      // Parent shows error toast; keep modal open
    }
  }, [roomId, draftWall, draftFloor, onSave, onClose, isSaving]);

  const handleReset = useCallback(() => {
    // Reset restores the canonical default layout — theme-independent, deterministic
    const defaultLayout = DEFAULT_ROOM_LAYOUTS[roomId];
    setDraftWall(defaultLayout.wall);
    setDraftFloor(defaultLayout.floor);
  }, [roomId]);

  const handleUseTheme = useCallback(() => {
    // Apply the active app theme's derived colors to the draft
    const themeLayout = getThemeRoomDefaults()[roomId];
    setDraftWall(themeLayout.wall);
    setDraftFloor(themeLayout.floor);
  }, [roomId]);

  const isDirty = useMemo(() => (
    JSON.stringify({ wall: draftWall, floor: draftFloor }) !==
    JSON.stringify(currentLayout)
  ), [draftWall, draftFloor, currentLayout]);

  const roomMeta = ROOM_META[roomId];

  return (
    <div className="absolute inset-0 z-[55] flex items-center justify-center p-4">
      {/* Backdrop — covers only the room shell area */}
      <div
        className="absolute inset-0 bg-background/55 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal card */}
      <div
        className={cn(
          'relative z-[56] w-full max-w-xl',
          'rounded-3xl border border-border/60',
          'bg-background/95 shadow-2xl backdrop-blur-md',
          'overflow-hidden',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          'max-h-[85dvh] flex flex-col',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="size-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <roomMeta.icon className="size-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold leading-tight">Edit {roomMeta.label}</h2>
              <p className="text-[11px] text-muted-foreground">Customize wall and floor style</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
            aria-label="Close editor"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Tab bar: Wall / Floor — pill segmented control */}
        <div className="px-5 pb-3">
          <div className="flex p-1 rounded-xl bg-muted/50">
            <button
              type="button"
              onClick={() => setActiveTab('wall')}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-all duration-150',
                activeTab === 'wall'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Wall
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('floor')}
              className={cn(
                'flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-all duration-150',
                activeTab === 'floor'
                  ? 'bg-background shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              Floor
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 min-h-0 px-5 pb-4 space-y-4">
          {/* Room preview */}
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
              Preview
            </label>
            <RoomPreviewCard wall={draftWall} floor={draftFloor} />
          </div>

          {/* Surface editor — pattern, colors, variant, angle */}
          <div className="rounded-2xl border border-border/40 bg-muted/20 p-3.5">
            {activeTab === 'wall' ? (
              <RoomSurfaceEditor
                type="wall"
                value={draftWall}
                onChange={setDraftWall}
              />
            ) : (
              <RoomSurfaceEditor
                type="floor"
                value={draftFloor}
                onChange={setDraftFloor}
              />
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 px-5 py-3.5 border-t border-border/30 bg-muted/10">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            disabled={isSaving}
            className="gap-1 text-muted-foreground hover:text-foreground px-2"
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUseTheme}
            disabled={isSaving}
            className="gap-1 text-muted-foreground hover:text-foreground px-2"
          >
            <Palette className="size-3.5" />
            <span className="hidden min-[400px]:inline">Use</span> theme
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || isSaving}
            className="gap-1.5"
          >
            <Check className="size-3.5" />
            {isSaving ? 'Saving...' : 'Apply'}
          </Button>
        </div>
      </div>
    </div>
  );
}
