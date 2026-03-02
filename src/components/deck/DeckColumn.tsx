import { X } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sidebarItemIcon, itemLabel } from '@/lib/sidebarItems';
import { DeckColumnContent } from '@/components/deck/DeckColumnContent';
import { cn } from '@/lib/utils';
import type { DeckColumnConfig } from '@/contexts/AppContext';

interface DeckColumnProps {
  config: DeckColumnConfig;
  onRemove: (id: string) => void;
}

export function DeckColumn({ config, onRemove }: DeckColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: config.width ?? 400,
    minWidth: config.width ?? 400,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex flex-col h-screen border-r border-border bg-background shrink-0',
        isDragging && 'z-10 opacity-80 shadow-lg',
      )}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b border-border bg-background/90 backdrop-blur-sm shrink-0 cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <span className="shrink-0 text-primary">{sidebarItemIcon(config.type, 'size-5')}</span>
        <span className="font-semibold text-sm truncate flex-1">{itemLabel(config.type)}</span>
        <button
          onClick={() => onRemove(config.id)}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove column"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <DeckColumnContent type={config.type} />
      </div>
    </div>
  );
}
