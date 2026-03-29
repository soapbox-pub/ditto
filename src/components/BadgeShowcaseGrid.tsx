import { Link } from 'react-router-dom';
import { Award, Pencil } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { BadgeData } from '@/components/BadgeContent';
import { cn } from '@/lib/utils';

interface BadgeDisplayItem {
  aTag: string;
  pubkey: string;
  identifier: string;
  badge?: BadgeData;
}

interface BadgeShowcaseGridProps {
  /** Badge items to display. */
  items: BadgeDisplayItem[];
  /** Maximum items to show before truncating with "+N". */
  maxVisible?: number;
  /** Thumbnail size in pixels. Default: 48 */
  thumbnailSize?: number;
  /** Show badge names below thumbnails. Default: true */
  showNames?: boolean;
  /** Show edit button (own profile). */
  showEditButton?: boolean;
  /** Edit button link target. */
  editPath?: string;
  /** Whether data is loading. */
  isLoading?: boolean;
  /** Grid columns class. Default: "grid-cols-4 sm:grid-cols-6" */
  gridCols?: string;
  className?: string;
}

export function BadgeShowcaseGrid({
  items,
  maxVisible = 12,
  thumbnailSize = 48,
  showNames = true,
  showEditButton,
  editPath = '/badges',
  isLoading,
  gridCols = 'grid-cols-4 sm:grid-cols-6',
  className,
}: BadgeShowcaseGridProps) {
  if (isLoading) {
    return (
      <div className={cn('grid gap-3', gridCols, className)}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <Skeleton className="rounded-lg" style={{ width: thumbnailSize, height: thumbnailSize }} />
            {showNames && <Skeleton className="h-3 w-12" />}
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const remaining = Math.max(0, items.length - maxVisible);

  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('grid gap-3', gridCols)}>
        {visible.map((item) => {
          const badgeUrl = `/${nip19.naddrEncode({ kind: 30009, pubkey: item.pubkey, identifier: item.identifier })}`;

          return (
            <Link
              key={item.aTag}
              to={badgeUrl}
              className="flex flex-col items-center gap-1.5 group"
              title={item.badge?.description || item.badge?.name || item.identifier}
              onClick={(e) => e.stopPropagation()}
            >
              {item.badge ? (
                <BadgeThumbnail badge={item.badge} size={thumbnailSize} />
              ) : (
                <div
                  className="rounded-lg border border-border bg-background flex items-center justify-center"
                  style={{ width: thumbnailSize, height: thumbnailSize }}
                >
                  <Award className="size-6 text-muted-foreground" />
                </div>
              )}
              {showNames && (
                <span className="text-[10px] text-muted-foreground text-center leading-tight line-clamp-2 max-w-[4.5rem] group-hover:text-foreground transition-colors">
                  {item.badge?.name || item.identifier}
                </span>
              )}
            </Link>
          );
        })}
        {remaining > 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5">
            <div
              className="rounded-lg bg-muted flex items-center justify-center text-muted-foreground text-xs font-medium"
              style={{ width: thumbnailSize, height: thumbnailSize }}
            >
              +{remaining}
            </div>
          </div>
        )}
      </div>
      {showEditButton && editPath && (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" asChild>
            <Link to={editPath}>
              <Pencil className="size-3" />
              Edit Badges
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
