import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, GripVertical, X } from 'lucide-react';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { WidgetDefinition } from '@/lib/sidebarWidgets';
import type { WidgetConfig } from '@/contexts/AppContext';

interface WidgetCardProps {
  definition: WidgetDefinition;
  config: WidgetConfig;
  onToggleCollapse: () => void;
  onRemove: () => void;
  onHeightChange: (height: number) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  children: ReactNode;
}

/** Wrapper for each widget in the sidebar — header, collapse, height control. */
export function WidgetCard({
  definition,
  config,
  onToggleCollapse,
  onRemove,
  onHeightChange,
  isDragging,
  dragHandleProps,
  children,
}: WidgetCardProps) {
  const collapsed = config.collapsed ?? false;
  const configHeight = config.height ?? definition.defaultHeight;
  const Icon = definition.icon;

  // Local height for smooth resize — only commits to config on pointer up.
  const [liveHeight, setLiveHeight] = useState(configHeight);
  const [resizing, setResizing] = useState(false);
  const liveHeightRef = useRef(liveHeight);

  // Sync local height when config changes externally (e.g. cross-device sync).
  useEffect(() => {
    if (!resizing) {
      setLiveHeight(configHeight);
    }
  }, [configHeight, resizing]);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setResizing(true);
    const startY = e.clientY;
    const startHeight = liveHeightRef.current;

    const onMove = (ev: PointerEvent) => {
      const newHeight = Math.max(
        definition.minHeight,
        Math.min(definition.maxHeight, startHeight + (ev.clientY - startY)),
      );
      liveHeightRef.current = newHeight;
      setLiveHeight(newHeight);
    };

    const onUp = () => {
      setResizing(false);
      onHeightChange(liveHeightRef.current);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, [definition.minHeight, definition.maxHeight, onHeightChange]);

  return (
    <div
      className={cn(
        'bg-background/85 rounded-xl overflow-hidden transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/20',
        resizing && 'select-none',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/50">
        {/* Drag handle */}
        <button
          className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing transition-colors"
          {...dragHandleProps}
          tabIndex={-1}
        >
          <GripVertical className="size-3.5" />
        </button>

        {/* Icon + label */}
        {definition.href ? (
          <Link to={definition.href} className="flex items-center gap-1.5 flex-1 min-w-0 hover:text-primary transition-colors">
            <Icon className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold truncate">{definition.label}</span>
          </Link>
        ) : (
          <>
            <Icon className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold flex-1 truncate">{definition.label}</span>
          </>
        )}

        {/* Collapse toggle */}
        <button
          onClick={onToggleCollapse}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
        </button>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
          aria-label="Remove widget"
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* Content */}
      {!collapsed && (
        <>
          <ScrollArea style={definition.fillHeight ? { height: liveHeight } : { maxHeight: liveHeight }} className={cn(!resizing && (definition.fillHeight ? 'transition-[height] duration-200' : 'transition-[max-height] duration-200'))}>
            <div className="p-2">
              {children}
            </div>
          </ScrollArea>

          {/* Resize handle */}
          <div
            onPointerDown={handleResizeStart}
            className="h-1.5 cursor-ns-resize flex items-center justify-center hover:bg-secondary/60 transition-colors group"
          >
            <div className="w-8 h-0.5 rounded-full bg-border group-hover:bg-muted-foreground/40 transition-colors" />
          </div>
        </>
      )}
    </div>
  );
}
