/**
 * Top8Grid
 *
 * The shared visual for a kind 18678 Top 8 (see NIP.md): a numbered grid of
 * portrait tiles, one per person, in rank order. Deliberately evocative of the
 * MySpace Top 8 that inspired the kind — square-cropped photos, a rank badge
 * in the corner, names underneath — but drawn with theme tokens so it fits
 * whatever palette the user is running.
 *
 * Used by the feed card, the profile sidebar, and the /top-8 editor, so all
 * three stay visually identical.
 */

import { Link } from 'react-router-dom';
import { FormattedMessage } from 'react-intl';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';

export type Top8GridSize = 'sm' | 'md';

interface Top8TileProps {
  pubkey: string;
  /** 1-based rank, shown in the corner badge. */
  rank: number;
  size: Top8GridSize;
  /** Render as a plain (non-navigating) tile — used inside the drag-to-reorder editor. */
  static?: boolean;
}

/** One person's tile: square portrait, rank badge, name underneath. */
export function Top8Tile({ pubkey, rank, size, static: isStatic }: Top8TileProps) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const avatarShape = getAvatarShape(metadata);
  const profileUrl = useProfileUrl(pubkey, metadata);

  const body = (
    <>
      <div className="relative">
        <Avatar
          shape={avatarShape}
          className={cn(
            'w-full h-auto aspect-square rounded-lg ring-1 ring-border',
            'motion-safe:transition-transform motion-safe:duration-200',
            !isStatic && 'group-hover:scale-[1.03]',
          )}
        >
          <AvatarImage src={metadata?.picture} alt={displayName} className="object-cover" />
          <AvatarFallback className="rounded-lg text-lg font-bold">
            {displayName[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {/* Rank badge — the number is the point of a Top 8 */}
        <span
          className={cn(
            'absolute -top-1.5 -left-1.5 flex items-center justify-center rounded-full',
            'bg-primary text-primary-foreground font-bold tabular-nums shadow-sm ring-2 ring-background',
            size === 'sm' ? 'size-5 text-[10px]' : 'size-6 text-xs',
          )}
          aria-hidden
        >
          {rank}
        </span>
      </div>
      <span
        className={cn(
          'mt-1.5 block truncate text-center font-medium',
          size === 'sm' ? 'text-[11px]' : 'text-xs',
          !isStatic && 'group-hover:underline',
        )}
      >
        {displayName}
      </span>
    </>
  );

  if (author.isLoading) {
    return (
      <div className="min-w-0">
        <Skeleton className="w-full aspect-square rounded-lg" />
        <Skeleton className="mt-1.5 h-3 w-3/4 mx-auto" />
      </div>
    );
  }

  if (isStatic) {
    return <div className="min-w-0">{body}</div>;
  }

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link
        to={profileUrl}
        className="group min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        onClick={(e) => e.stopPropagation()}
        title={`#${rank} — ${displayName}`}
      >
        {body}
      </Link>
    </ProfileHoverCard>
  );
}

interface Top8GridProps {
  /** Pubkeys in rank order. */
  pubkeys: string[];
  size?: Top8GridSize;
  /** Number of columns. Defaults to 4 (the classic two-row Top 8 layout). */
  columns?: 2 | 3 | 4;
  className?: string;
}

const COLUMN_CLASS: Record<2 | 3 | 4, string> = {
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
};

/** A ranked grid of Top 8 tiles. Renders nothing when the list is empty. */
export function Top8Grid({ pubkeys, size = 'md', columns = 4, className }: Top8GridProps) {
  if (pubkeys.length === 0) return null;

  return (
    <ul className={cn('grid gap-3', COLUMN_CLASS[columns], className)}>
      {pubkeys.map((pubkey, i) => (
        <li key={pubkey} className="min-w-0">
          <Top8Tile pubkey={pubkey} rank={i + 1} size={size} />
        </li>
      ))}
    </ul>
  );
}

/** Shared empty state for a Top 8 with nobody in it. */
export function Top8Empty({ className }: { className?: string }) {
  return (
    <p className={cn('text-sm text-muted-foreground', className)}>
      <FormattedMessage id="top8.empty" defaultMessage="Nobody in this Top 8 yet." />
    </p>
  );
}
