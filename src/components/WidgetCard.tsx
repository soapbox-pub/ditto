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

  return (
    <div
      className={cn(
        'group/widget bg-background/85 rounded-2xl overflow-hidden transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/20',
        resizing && 'select-none',
      )}
    >
      {/* Header — text lines up with the content's px-2 + px-2 rows */}
      <div className="flex items-center gap-2 pl-4 pr-2 pt-3 pb-1">
        {/* Icon + label */}
        {definition.href ? (
          <Link to={definition.href} className="flex items-center gap-2 flex-1 min-w-0 hover:text-primary transition-colors">
            <Icon className="size-5 text-muted-foreground shrink-0" />
            <span className="text-lg font-bold truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>{label}</span>
          </Link>
        ) : (
          <>
            <Icon className="size-5 text-muted-foreground shrink-0" />
            <span className="text-lg font-bold flex-1 truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>{label}</span>
          </>
        )}

        {/* Controls — revealed on hover or focus, always shown on touch */}
        <div
          className={cn(
            'flex items-center shrink-0 opacity-0 transition-opacity',
            'group-hover/widget:opacity-100 group-focus-within/widget:opacity-100 [@media(hover:none)]:opacity-100',
            isDragging && 'opacity-100',
          )}
        >
          <button
            className="flex items-center justify-center size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 cursor-grab active:cursor-grabbing transition-colors"
            {...dragHandleProps}
            tabIndex={-1}
            aria-hidden
          >
            <GripVertical className="size-4" />
          </button>
          <button
            onClick={onRemove}
            className="flex items-center justify-center size-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={intl.formatMessage({ id: 'widgets.common.removeWidget', defaultMessage: "Remove widget" })}
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {definition.fillHeight ? (
        <div style={{ height: liveHeight }} className={cn('px-2 pb-2', !resizing && 'transition-[height] duration-200')}>
          {children}
        </div>
      ) : (
        <ScrollArea style={{ maxHeight: liveHeight }} className={cn(!resizing && 'transition-[max-height] duration-200')}>
          <div className="px-2 pb-2">
            {children}
          </div>
        </ScrollArea>
      )}

      {/* Resize handle */}
      <div
        onPointerDown={handleResizeStart}
        className="h-2 cursor-ns-resize opacity-0 group-hover/widget:opacity-100 hover:bg-secondary/60 transition-[opacity,background-color]"
      />
    </div>
  );
}
