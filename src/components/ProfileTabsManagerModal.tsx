/**
 * ProfileTabsManagerModal
 *
 * Sheet-style modal for managing custom profile tabs:
 * - Drag to reorder (dnd-kit)
 * - Remove individual tabs
 * - Edit a tab (opens ProfileTabEditModal)
 * - Add a custom tab
 */
import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProfileTabEditModal } from '@/components/ProfileTabEditModal';
import { cn } from '@/lib/utils';
import type { ProfileTab } from '@/lib/profileTabsEvent';

interface ProfileTabsManagerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tabs: ProfileTab[];
  ownerPubkey: string;
  onSave: (tabs: ProfileTab[]) => Promise<void>;
  isPending?: boolean;
}

export function ProfileTabsManagerModal({
  open,
  onOpenChange,
  tabs,
  ownerPubkey,
  onSave,
  isPending = false,
}: ProfileTabsManagerModalProps) {
  const [localTabs, setLocalTabs] = useState<ProfileTab[]>(tabs);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingTab, setEditingTab] = useState<ProfileTab | undefined>(undefined);

  // Sync from parent when modal opens
  const handleOpenChange = (o: boolean) => {
    if (o) setLocalTabs(tabs);
    onOpenChange(o);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalTabs((prev) => {
        const oldIndex = prev.findIndex((t) => t.label === active.id);
        const newIndex = prev.findIndex((t) => t.label === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleRemove = (label: string) => {
    setLocalTabs((prev) => prev.filter((t) => t.label !== label));
  };

  const handleEditTab = (tab: ProfileTab) => {
    setEditingTab(tab);
    setEditModalOpen(true);
  };

  const handleAddCustom = () => {
    setEditingTab(undefined);
    setEditModalOpen(true);
  };

  const handleTabSaved = async (tab: ProfileTab) => {
    setLocalTabs((prev) => {
      if (editingTab) {
        return prev.map((t) => t.label === editingTab.label ? tab : t);
      }
      return [...prev, tab];
    });
  };

  const handleSaveAll = async () => {
    await onSave(localTabs);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage profile tabs</DialogTitle>
          </DialogHeader>

          <div className="space-y-1 py-1">
            {localTabs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No custom tabs yet.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={localTabs.map((t) => t.label)} strategy={verticalListSortingStrategy}>
                  {localTabs.map((tab) => (
                    <SortableTabRow
                      key={tab.label}
                      tab={tab}
                      onEdit={() => handleEditTab(tab)}
                      onRemove={() => handleRemove(tab.label)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}

            <button
              onClick={handleAddCustom}
              className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
            >
              <Plus className="size-4 shrink-0" />
              Add custom tab
            </button>
          </div>

          <Button
            className="w-full gap-2 mt-2"
            onClick={handleSaveAll}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogContent>
      </Dialog>

      {/* Nested edit modal */}
      <ProfileTabEditModal
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        tab={editingTab}
        ownerPubkey={ownerPubkey}
        onSave={handleTabSaved}
        isPending={false}
      />
    </>
  );
}

function SortableTabRow({
  tab,
  onEdit,
  onRemove,
}: {
  tab: ProfileTab;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: tab.label });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 px-2 py-2 rounded-lg bg-secondary/20 border border-border/50',
        isDragging && 'opacity-50 shadow-lg z-50',
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="size-4" />
      </button>

      <span className="flex-1 text-sm font-medium truncate">{tab.label}</span>

      <button
        onClick={onEdit}
        className="shrink-0 size-7 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        aria-label={`Edit ${tab.label}`}
      >
        <Pencil className="size-3.5" />
      </button>
      <button
        onClick={onRemove}
        className="shrink-0 size-7 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
        aria-label={`Remove ${tab.label}`}
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
