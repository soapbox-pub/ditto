import { Link } from 'react-router-dom';
import { Globe, BookOpen } from 'lucide-react';
import { useMemo } from 'react';

import { cn } from '@/lib/utils';
import { SortableItemShell } from '@/components/SortableItemShell';
import { parseExternalUri, headerLabel } from '@/lib/externalContent';
import { getCountryInfo } from '@/lib/countries';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { useBookInfo } from '@/hooks/useBookInfo';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ExternalContentSidebarItemProps {
  /** The external identifier (URL, iso3166:XX, isbn:...). */
  id: string;
  active: boolean;
  editing: boolean;
  onRemove: (id: string, index?: number) => void;
  onAdd?: (id: string) => void;
  /** True when this item is below the "More..." separator (hidden zone). */
  belowMore?: boolean;
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

  if (content.type === 'isbn') {
    return <BookOpen className="size-5 shrink-0" />;
  }

  return <Globe className="size-6 shrink-0" />;
}

function ExternalSidebarLabel({ id }: { id: string }) {
  const content = useMemo(() => parseExternalUri(id), [id]);
  const isbn = content.type === 'isbn' ? content.value.replace('isbn:', '') : null;
  const { data: book } = useBookInfo(isbn);

  const label = content.type === 'isbn' && book?.title ? book.title : headerLabel(content);

  return <span className="truncate">{label}</span>;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ExternalContentSidebarItem({
  id, active, editing, onRemove, onAdd, belowMore, onClick, linkClassName,
}: ExternalContentSidebarItemProps) {
  const path = `/i/${encodeURIComponent(id)}`;

  return (
    <SortableItemShell id={id} editing={editing} onRemove={onRemove} onAdd={onAdd} belowMore={belowMore}>
      <Link
        to={path}
        onClick={onClick}
        className={cn(
          'flex items-center gap-4 py-3 rounded-full transition-colors flex-1 min-w-0',
          editing ? 'px-2' : 'px-3',
          active ? 'font-bold text-primary' : 'font-normal text-foreground',
          linkClassName ?? 'text-lg',
        )}
      >
        <span className="shrink-0">
          <ExternalSidebarIcon id={id} />
        </span>
        <span className="truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>
          <ExternalSidebarLabel id={id} />
        </span>
      </Link>
    </SortableItemShell>
  );
}
