import { Link } from 'react-router-dom';
import { FileText, Scroll, WandSparkles } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrMetadata } from '@nostrify/nostrify';
import type { ComponentType } from 'react';

import { cn } from '@/lib/utils';
import { nostrUriToNip19 } from '@/lib/sidebarItems';
import { SortableItemShell } from '@/components/SortableItemShell';
import { useAuthor } from '@/hooks/useAuthor';
import { getKindIcon } from '@/lib/extraKinds';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { genUserName } from '@/lib/genUserName';
import { Skeleton } from '@/components/ui/skeleton';
import { useNostrEventSidebar } from '@/hooks/useNostrEventSidebar';

/**
 * Icons for well-known kinds that aren't in EXTRA_KINDS.
 * Used as a fallback when getKindIcon() returns undefined.
 */
const KNOWN_KIND_ICONS: Record<number, ComponentType<{ className?: string }>> = {
  777: WandSparkles, // Spells
  30000: Scroll,     // NIP-51 lists
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NostrEventSidebarItemProps {
  /** The full nostr: URI, e.g. "nostr:npub1..." */
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

function resolveKindIcon(kind: number): ComponentType<{ className?: string }> {
  return getKindIcon(kind) ?? KNOWN_KIND_ICONS[kind] ?? FileText;
}

/**
 * Renders icon + label for a non-profile event sidebar item.
 * Fetches the event to resolve the kind (needed when the nevent doesn't
 * encode a kind) and derives the correct icon and navigation path.
 */
function EventSidebarContent({ decoded, nip19Id, linkClassName, active, editing, onClick }: {
  decoded: DecodedNostrId;
  nip19Id: string;
  linkClassName?: string;
  active: boolean;
  editing: boolean;
  onClick?: (e: React.MouseEvent) => void;
}) {
  const params = decoded.type === 'naddr' && decoded.identifier !== undefined
    ? { addr: { kind: decoded.kind!, pubkey: decoded.pubkey, identifier: decoded.identifier } }
    : { eventId: decoded.eventId };

  const { data, isLoading } = useNostrEventSidebar(params);

  // Use fetched kind when available, fall back to decoded kind
  const resolvedKind = data?.kind ?? decoded.kind ?? 1;
  const Icon = resolveKindIcon(resolvedKind);

  const path = `/${nip19Id}`;

  return (
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
        <Icon className="size-6" />
      </span>
      <span className="truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>
        {isLoading && !data ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          data?.label ?? 'Event'
        )}
      </span>
    </Link>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NostrEventSidebarItem({
  id, active, editing, onRemove, onAdd, belowMore, onClick, linkClassName,
}: NostrEventSidebarItemProps) {
  const nip19Id = nostrUriToNip19(id);
  const decoded = decodeNostrId(nip19Id);

  if (!decoded) {
    // Invalid nostr URI — render nothing
    return null;
  }

  const isProfile = decoded.type === 'npub' || decoded.type === 'nprofile';

  return (
    <SortableItemShell id={id} editing={editing} onRemove={onRemove} onAdd={onAdd} belowMore={belowMore}>
      {isProfile ? (
        <Link
          to={`/${nip19Id}`}
          onClick={onClick}
          className={cn(
            'flex items-center gap-4 py-3 rounded-full transition-colors flex-1 min-w-0',
            editing ? 'px-2' : 'px-3',
            active ? 'font-bold text-primary' : 'font-normal text-foreground',
            linkClassName ?? 'text-lg',
          )}
        >
          <span className="shrink-0">
            <ProfileSidebarIcon pubkey={decoded.pubkey} />
          </span>
          <span className="truncate" style={{ fontFamily: 'var(--title-font-family, inherit)' }}>
            <ProfileSidebarLabel pubkey={decoded.pubkey} />
          </span>
        </Link>
      ) : (
        <EventSidebarContent
          decoded={decoded}
          nip19Id={nip19Id}
          linkClassName={linkClassName}
          active={active}
          editing={editing}
          onClick={onClick}
        />
      )}
    </SortableItemShell>
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
