import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, X } from 'lucide-react';
import { useIntl } from 'react-intl';

import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useWidgetLabel, type WidgetDefinition } from '@/lib/sidebarWidgets';
import type { WidgetConfig } from '@/contexts/AppContext';

interface WidgetCardProps {
  definition: WidgetDefinition;
  config: WidgetConfig;
  onRemove: () => void;
  onHeightChange: (height: number) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  children: ReactNode;
}

/** Wrapper for each widget in the sidebar — header, height control. */
export function WidgetCard({
  definition,
  config,
  onRemove,
  onHeightChange,
  isDragging,
  dragHandleProps,
  children,
}: WidgetCardProps) {
  const configHeight = config.height ?? definition.defaultHeight;
  const Icon = definition.icon;
  const intl = useIntl();
  const label = useWidgetLabel(definition.id);

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

  const handleResizeKeyDown = useCallback((event: React.KeyboardEvent) => {
    const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const height = Math.max(
      definition.minHeight,
      Math.min(definition.maxHeight, liveHeightRef.current + direction * 16),
    );
    liveHeightRef.current = height;
    setLiveHeight(height);
    onHeightChange(height);
  }, [definition.minHeight, definition.maxHeight, onHeightChange]);

  return (
    <div
      className={cn(
        'bg-background/85 rounded-xl overflow-hidden motion-safe:transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/20',
        resizing && 'select-none',
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        {/* Icon + label */}
        {definition.href ? (
          <Link to={definition.href} className="flex min-w-0 flex-1 items-center gap-1.5 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Icon className="size-5 text-muted-foreground shrink-0" />
            <span className="text-xl font-semibold truncate">{label}</span>
          </Link>
        ) : (
          <>
            <Icon className="size-5 text-muted-foreground shrink-0" />
            <span className="text-xl font-semibold flex-1 truncate">{label}</span>
          </>
        )}

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          className="rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={intl.formatMessage({ id: 'widgets.common.removeWidget', defaultMessage: "Remove widget" })}
        >
          <X className="size-3.5" />
        </button>

        {/* Drag handle */}
        <button
          type="button"
          className="cursor-grab rounded p-0.5 text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          {...dragHandleProps}
          aria-label={`Reorder ${definition.label} widget`}
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      {/* Content */}
      {definition.fillHeight ? (
        <div style={{ height: liveHeight }} className={cn('p-2', !resizing && 'motion-safe:transition-[height] motion-safe:duration-200')}>
          {children}
        </div>
      ) : (
          <ScrollArea style={{ maxHeight: liveHeight }} className={cn(!resizing && 'motion-safe:transition-[max-height] motion-safe:duration-200')}>
          <div className="p-2">
            {children}
          </div>
        </ScrollArea>
      )}

      {/* Resize handle */}
      <div
        onPointerDown={handleResizeStart}
        onKeyDown={handleResizeKeyDown}
        role="separator"
        tabIndex={0}
        aria-label={`Resize ${definition.label} widget`}
        aria-orientation="horizontal"
        aria-valuemin={definition.minHeight}
        aria-valuemax={definition.maxHeight}
        aria-valuenow={liveHeight}
        aria-valuetext={`${liveHeight} pixels`}
        className="flex h-1.5 cursor-ns-resize items-center justify-center transition-colors hover:bg-secondary/60 focus-visible:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}
