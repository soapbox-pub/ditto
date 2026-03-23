import { Link } from 'react-router-dom';
import { GripVertical, X, FileText } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';

import { cn } from '@/lib/utils';
import { nostrUriToNip19 } from '@/lib/sidebarItems';
import { useAuthor } from '@/hooks/useAuthor';
import { getKindIcon } from '@/lib/extraKinds';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { genUserName } from '@/lib/genUserName';
import { Skeleton } from '@/components/ui/skeleton';
import { useNostrEventSidebar } from '@/hooks/useNostrEventSidebar';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NostrEventSidebarItemProps {
  /** The full nostr: URI, e.g. "nostr:npub1..." */
  id: string;
  active: boolean;
  editing: boolean;
  onRemove: (id: string, index?: number) => void;
  onClick?: (e: React.MouseEvent) => void;
  /** Extra classes on the link. */
  linkClassName?: string;
}

// ── Profile sidebar item ──────────────────────────────────────────────────────

function ProfileSidebarIcon({ pubkey, className }: { pubkey: string; className?: string }) {
  const { data } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;
  const shape = getAvatarShape(metadata);

  return (
    <Avatar shape={shape} className={cn('size-6 shrink-0', className)}>
      <AvatarImage src={metadata?.picture} alt={metadata?.name} />
      <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
        {(metadata?.name?.[0] || '?').toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function ProfileSidebarLabel({ pubkey }: { pubkey: string }) {
  const { data, isLoading } = useAuthor(pubkey);
  const metadata: NostrMetadata | undefined = data?.metadata;

  if (isLoading && !metadata) {
    return <Skeleton className="h-4 w-20" />;
  }

  return (
    <span className="truncate">
      {metadata?.display_name || metadata?.name || genUserName(pubkey)}
    </span>
  );
}

// ── Event sidebar item (non-profile) ──────────────────────────────────────────

function EventSidebarIcon({ kind, className }: { kind: number; className?: string }) {
  const Icon = getKindIcon(kind) ?? FileText;
  return <Icon className={cn('size-6', className)} />;
}

interface EventSidebarLabelProps {
  decoded: DecodedNostrId;
}

function EventSidebarLabel({ decoded }: EventSidebarLabelProps) {
  const params = decoded.type === 'naddr' && decoded.identifier !== undefined
    ? { addr: { kind: decoded.kind!, pubkey: decoded.pubkey, identifier: decoded.identifier } }
    : { eventId: decoded.eventId };

  const { data, isLoading } = useNostrEventSidebar(params);

  if (isLoading && !data) {
    return <Skeleton className="h-4 w-20" />;
  }

  return (
    <span className="truncate">
      {data?.label ?? 'Event'}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NostrEventSidebarItem({
  id, active, editing, onRemove, onClick, linkClassName,
}: NostrEventSidebarItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !editing });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const nip19Id = nostrUriToNip19(id);
  const decoded = decodeNostrId(nip19Id);

  if (!decoded) {
    // Invalid nostr URI — render nothing
    return null;
  }

  const path = `/${nip19Id}`;
  const isProfile = decoded.type === 'npub' || decoded.type === 'nprofile';

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
          {isProfile ? (
            <ProfileSidebarIcon pubkey={decoded.pubkey} />
          ) : (
            <EventSidebarIcon kind={decoded.kind ?? 1} />
          )}
        </span>
        <span className="truncate">
          {isProfile ? (
            <ProfileSidebarLabel pubkey={decoded.pubkey} />
          ) : (
            <EventSidebarLabel decoded={decoded} />
          )}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

interface DecodedNostrId {
  type: 'npub' | 'nprofile' | 'note' | 'nevent' | 'naddr';
  pubkey: string;
  eventId?: string;
  kind?: number;
  identifier?: string;
  relays?: string[];
}

function decodeNostrId(nip19Id: string): DecodedNostrId | null {
  try {
    const decoded = nip19.decode(nip19Id);
    switch (decoded.type) {
      case 'npub':
        return { type: 'npub', pubkey: decoded.data as string };
      case 'nprofile': {
        const data = decoded.data as { pubkey: string; relays?: string[] };
        return { type: 'nprofile', pubkey: data.pubkey, relays: data.relays };
      }
      case 'note':
        return { type: 'note', pubkey: '', eventId: decoded.data as string, kind: 1 };
      case 'nevent': {
        const data = decoded.data as { id: string; relays?: string[]; author?: string; kind?: number };
        return { type: 'nevent', pubkey: data.author ?? '', eventId: data.id, kind: data.kind, relays: data.relays };
      }
      case 'naddr': {
        const data = decoded.data as { pubkey: string; kind: number; identifier: string; relays?: string[] };
        return { type: 'naddr', pubkey: data.pubkey, kind: data.kind, identifier: data.identifier, relays: data.relays };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}
