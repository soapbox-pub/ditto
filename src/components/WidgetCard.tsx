import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GripVertical, X } from 'lucide-react';
import { useIntl } from 'react-intl';

import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getBackgroundThemeMode } from '@/lib/colorUtils';
import { useAppContext } from '@/hooks/useAppContext';
import { widgetAccentVars } from '@/lib/widgetAccent';
import type { WidgetDefinition } from '@/lib/sidebarWidgets';
import type { WidgetConfig } from '@/contexts/AppContext';

interface WidgetCardProps {
  definition: WidgetDefinition;
  config: WidgetConfig;
  onRemove: () => void;
  onHeightChange: (height: number) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
  children: ReactNode;
  /** When true, title text is hidden; the widget label is shown via tooltip on the drag area instead. */
  hideTitle?: boolean;
}

/** Wrapper for each widget in the sidebar — thin frame, thumb handle bar, deterministic accent. */
export function WidgetCard({
  definition,
  config,
  onRemove,
  onHeightChange,
  isDragging,
  dragHandleProps,
  children,
  hideTitle = false,
}: WidgetCardProps) {
  const configHeight = config.height ?? definition.defaultHeight;
  const Icon = definition.icon;
  const intl = useIntl();

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

  // ── Accent colour ──────────────────────────────────────────────────────

  // Subscribing to config.theme makes the card re-render on theme changes
  // (SortableWidget is memoized, but context updates pierce memo); the theme
  // CSS vars are applied synchronously before that re-render, so reading the
  // live --background here yields the new mode.
  const { config: appConfig } = useAppContext();
  void appConfig.theme;
  const mode = getBackgroundThemeMode();
  const accentVars = widgetAccentVars(definition.id, mode);

  // ── Handle bar sub-elements ────────────────────────────────────────────

  // The central drag region: a generous flex-1 button spanning the
  // middle of the bar, with the grip icon right-aligned inside it.
  const dragButton = (
    <button
      type="button"
      className="flex-1 min-w-0 flex items-center justify-end cursor-grab rounded px-0.5 text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...dragHandleProps}
      aria-label={`Reorder ${definition.label} widget`}
    >
      <GripVertical className="size-3.5" />
    </button>
  );

  // Title label — shown for builtin widgets, hidden for canvas widgets.
  const titleContent = hideTitle ? null : definition.href ? (
    <Link
      to={definition.href}
      className="min-w-0 shrink text-xs font-medium text-muted-foreground truncate transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm px-0.5"
    >
      {definition.label}
    </Link>
  ) : (
    <span className="min-w-0 shrink text-xs font-medium text-muted-foreground truncate px-0.5">
      {definition.label}
    </span>
  );

  return (
    <div
      className={cn(
        'border-2 border-[hsl(var(--widget-accent)/0.65)] bg-background/85 rounded-xl overflow-hidden motion-safe:transition-shadow',
        isDragging && 'shadow-lg ring-1 ring-primary/20',
        resizing && 'select-none',
      )}
      style={accentVars as React.CSSProperties}
    >
      {/* ── Handle bar (always visible) ──────────────────────────────── */}
      <div className="flex items-center gap-0.5 px-2 h-7 bg-[hsl(var(--widget-accent)/0.12)]">
        {/* Widget icon */}
        <Icon className="size-3.5 text-muted-foreground shrink-0" />

        {/* Title (builtin only) */}
        {titleContent}

        {/* Drag region — wrapped in Tooltip for canvas widgets */}
        {hideTitle ? (
          <Tooltip>
            <TooltipTrigger asChild>
              {dragButton}
            </TooltipTrigger>
            <TooltipContent side="right">
              {definition.label}
            </TooltipContent>
          </Tooltip>
        ) : (
          dragButton
        )}

        {/* Remove */}
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={intl.formatMessage({ id: 'widgets.common.removeWidget', defaultMessage: "Remove widget" })}
        >
          <X className="size-3.5" />
        </button>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
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

      {/* ── Resize handle ────────────────────────────────────────────── */}
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
