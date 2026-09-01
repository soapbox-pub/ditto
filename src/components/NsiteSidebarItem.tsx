import { useNavigate } from 'react-router-dom';
import { GripVertical, Rocket, X } from 'lucide-react';
import { useSortable, CSS } from '@/lib/sortable';
import { nip19 } from 'nostr-tools';
import { useCallback, useMemo } from 'react';

import { cn } from '@/lib/utils';
import { nsiteUriToSubdomain } from '@/lib/sidebarItems';
import { NSITE_SNAPSHOT_KIND, type ParsedNsiteSubdomain, parseNsiteSubdomain } from '@/lib/nsiteSubdomain';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { useNsitePlayer } from '@/contexts/NsitePlayerContext';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { useNostrEventSidebar } from '@/hooks/useNostrEventSidebar';
import { Skeleton } from '@/components/ui/skeleton';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NsiteSidebarItemProps {
  /** The full nsite:// URI, e.g. "nsite://3cbg51pm00nms2dp8rm..." */
  id: string;
  /** Ignored -- active state is derived from NsitePlayerContext instead. Kept for caller consistency with other sidebar item types. */
  active?: boolean;
  editing: boolean;
  onRemove: (id: string, index?: number) => void;
  onClick?: (e: React.MouseEvent) => void;
  /** Extra classes on the link. */
  linkClassName?: string;
}

// ── Label sub-component ───────────────────────────────────────────────────────

function NsiteSidebarLabel({ subdomain, parsed }: { subdomain: string; parsed: ParsedNsiteSubdomain }) {
  const siteUrl = `https://${subdomain}.nsite.lol`;
  const { data: preview } = useLinkPreview(siteUrl);

  // Snapshots are regular events looked up by id; root and named sites are
  // located by their (kind, pubkey, identifier) coordinate.
  const isSnapshot = parsed.kind === NSITE_SNAPSHOT_KIND;

  const { data: eventData, isLoading } = useNostrEventSidebar(
    isSnapshot
      ? { eventId: parsed.id }
      : { addr: { kind: parsed.kind, pubkey: parsed.pubkey, identifier: parsed.identifier } },
  );

  if (isLoading && !eventData && !preview) {
    return <Skeleton className="h-4 w-20" />;
  }

  // Prefer the link preview title (the live site <title>), then the event tag label
  const label = preview?.title || eventData?.label || 'Nsite';

  return (
    <span className="truncate">
      {label}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NsiteSidebarItem({
  id, editing, onRemove, onClick, linkClassName,
}: NsiteSidebarItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const navigate = useNavigate();

  const subdomain = nsiteUriToSubdomain(id);
  const parsed = useMemo(() => parseNsiteSubdomain(subdomain), [subdomain]);

  // Highlight when the nsite player is open for this subdomain.
  const { activeSubdomain } = useNsitePlayer();
  const active = activeSubdomain === subdomain;

  // Build the detail-page path. Root sites are replaceable, so like named
  // sites they address as an naddr — with an empty identifier, since they
  // carry no `d` tag. Snapshots are regular events, so they address by id.
  const eventPath = useMemo(() => {
    if (!parsed) return null;
    if (parsed.kind === NSITE_SNAPSHOT_KIND) {
      return `/${nip19.neventEncode({ id: parsed.id })}`;
    }
    const naddr = nip19.naddrEncode({
      kind: parsed.kind,
      pubkey: parsed.pubkey,
      identifier: parsed.identifier,
    });
    return `/${naddr}`;
  }, [parsed]);

  // Navigate with a fresh timestamp on every click so the detail page
  // can detect repeated clicks and re-open the player.
  const handleClick = useCallback((e: React.MouseEvent) => {
    onClick?.(e);
    if (e.defaultPrevented || !eventPath) return;
    e.preventDefault();
    navigate(eventPath, { state: { nsiteAutoPlay: true, nsiteAutoPlayTs: Date.now() } });
  }, [eventPath, navigate, onClick]);

  if (!parsed || !eventPath) {
    // Invalid or unsupported nsite URI — render nothing
    return null;
  }

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

      <a
        href={eventPath}
        onClick={handleClick}
        className={cn(
          'flex items-center gap-4 py-3 rounded-full transition-colors hover:bg-secondary/60 flex-1 min-w-0',
          editing ? 'px-2' : 'px-3',
          active ? 'font-bold text-primary' : 'font-normal text-foreground',
          linkClassName ?? 'text-lg',
        )}
      >
        <span className="shrink-0">
          <ExternalFavicon
            url={`https://${subdomain}.nsite.lol`}
            size={20}
            fallback={<Rocket className="size-5" />}
            className="size-6 flex items-center justify-center"
          />
        </span>
        <span className="truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>
          <NsiteSidebarLabel subdomain={subdomain} parsed={parsed} />
        </span>
      </a>

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
