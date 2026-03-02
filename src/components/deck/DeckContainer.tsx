import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, horizontalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { useCallback } from 'react';
import { DeckColumn } from '@/components/deck/DeckColumn';
import { AddColumnCard } from '@/components/deck/AddColumnCard';
import { useDeckSettings } from '@/hooks/useDeckSettings';

/** Top-level deck layout: horizontal scrollable list of sortable columns. */
export function DeckContainer() {
  const { deckColumns, addColumn, removeColumn, reorderColumns } = useDeckSettings();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = deckColumns.findIndex((c) => c.id === active.id);
    const newIndex = deckColumns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    reorderColumns(arrayMove(deckColumns, oldIndex, newIndex));
  }, [deckColumns, reorderColumns]);

  return (
    <div className="flex h-screen overflow-x-auto flex-1 min-w-0">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={deckColumns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
          {deckColumns.map((col) => (
            <DeckColumn key={col.id} config={col} onRemove={removeColumn} />
          ))}
        </SortableContext>
      </DndContext>
      <AddColumnCard onAdd={addColumn} />
    </div>
  );
}
