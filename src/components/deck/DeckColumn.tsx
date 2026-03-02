import { useMemo } from 'react';
import { X, Hash, Globe, MessageSquare } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { sidebarItemIcon, itemLabel } from '@/lib/sidebarItems';
import { DeckColumnContent } from '@/components/deck/DeckColumnContent';
import { DeckLinkInterceptor } from '@/components/deck/DeckLinkInterceptor';
import { cn } from '@/lib/utils';
import type { DeckColumnConfig } from '@/contexts/AppContext';

interface DeckColumnProps {
  config: DeckColumnConfig;
  onRemove: (id: string) => void;
}

/** Resolve the header icon for a column based on type + params. */
function columnIcon(config: DeckColumnConfig) {
  if (config.type === 'hashtag') return <Hash className="size-5" />;
  if (config.type === 'discuss') return <MessageSquare className="size-5" />;
  if (config.type === 'domain-feed') return <Globe className="size-5" />;
  return sidebarItemIcon(config.type, 'size-5');
}

/** Resolve the header label for a column based on type + params. */
function columnLabel(config: DeckColumnConfig): string {
  if (config.type === 'hashtag' && config.params?.tag) return `#${config.params.tag}`;
  if (config.type === 'discuss' && config.params?.uri) {
    try {
      return new URL(config.params.uri).hostname.replace(/^www\./, '');
    } catch {
      return 'Discuss';
    }
  }
  if (config.type === 'domain-feed' && config.params?.domain) return config.params.domain;
  return itemLabel(config.type);
}

export function DeckColumn({ config, onRemove }: DeckColumnProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: config.width ?? 400,
    minWidth: config.width ?? 400,
  };

  // Build data-deck-param-* attributes for DOM querying by openColumn
  const paramAttrs = useMemo(() => {
    if (!config.params) return {};
    const attrs: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.params)) {
      attrs[`data-deck-param-${k}`] = v;
    }
    return attrs;
  }, [config.params]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-deck-column-type={config.type}
      {...paramAttrs}
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
        <span className="shrink-0 text-primary">{columnIcon(config)}</span>
        <span className="font-semibold text-sm truncate flex-1">{columnLabel(config)}</span>
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
        <DeckLinkInterceptor>
          <DeckColumnContent type={config.type} params={config.params} />
        </DeckLinkInterceptor>
      </div>
    </div>
  );
}
