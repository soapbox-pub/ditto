import { Link } from 'react-router-dom';
import { GripVertical, X, Globe } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { parseExternalUri, headerLabel } from '@/lib/externalContent';
import { getCountryInfo } from '@/lib/countries';
import { ExternalFavicon } from '@/components/ExternalFavicon';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExternalContentSidebarItemProps {
  /** The external identifier (URL, iso3166:XX, isbn:...). */
  id: string;
  active: boolean;
  editing: boolean;
  onRemove: (id: string, index?: number) => void;
  onClick?: (e: React.MouseEvent) => void;
  /** Extra classes on the link. */
  linkClassName?: string;
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

function ExternalSidebarIcon({ id }: { id: string }) {
  const content = useMemo(() => parseExternalUri(id), [id]);

  if (content.type === 'iso3166') {
    const info = getCountryInfo(content.code);
    if (info?.flag) {
      return <span className="text-lg leading-none shrink-0">{info.flag}</span>;
    }
  }

  if (content.type === 'url') {
    return (
      <ExternalFavicon
        url={content.value}
        size={20}
        fallback={<Globe className="size-5 text-muted-foreground" />}
        className="size-6 shrink-0 flex items-center justify-center"
      />
    );
  }

  return <Globe className="size-6 shrink-0" />;
}

function ExternalSidebarLabel({ id }: { id: string }) {
  const content = useMemo(() => parseExternalUri(id), [id]);
  return <span className="truncate">{headerLabel(content)}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExternalContentSidebarItem({
  id, active, editing, onRemove, onClick, linkClassName,
}: ExternalContentSidebarItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const path = `/i/${encodeURIComponent(id)}`;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn('flex items-center rounded-full transition-colors relative bg-background/85', isDragging && 'z-10 opacity-80 shadow-lg')}
    >
      {editing && (
        <button
          className="flex items-center justify-center w-8 shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}

      <Link
        to={path}
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 py-3 rounded-full transition-colors hover:bg-secondary/60 flex-1 min-w-0',
          editing ? 'px-2' : 'px-3',
          active ? 'font-bold text-primary' : 'font-normal text-foreground',
          linkClassName ?? 'text-lg',
        )}
      >
        <span className="shrink-0">
          <ExternalSidebarIcon id={id} />
        </span>
        <span className="truncate">
          <ExternalSidebarLabel id={id} />
        </span>
      </Link>

      {editing && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(id); }}
          className="flex items-center justify-center size-8 shrink-0 rounded-full transition-all text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Remove"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
