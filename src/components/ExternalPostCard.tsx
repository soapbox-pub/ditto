import { type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, MessageCircle, Repeat2 } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

/** A single image attachment. */
export interface ExternalImage {
  thumb: string;
  alt: string;
}

/** An external link card. */
export interface ExternalExternal {
  title: string;
  thumb?: string;
}

/**
 * Shared shape for a social post from any external platform
 * (Bluesky, Mastodon, etc.).
 */
export interface ExternalPostData {
  /** Display name of the post author. */
  displayName: string;
  /** Handle / username (without leading @). */
  handle: string;
  /** Avatar URL. */
  avatar?: string;
  /** Plaintext content of the post. */
  text: string;
  /** ISO-8601 creation date. */
  createdAt: string;
  /** Canonical URL of the post on the source platform. */
  postUrl: string;
  /** Canonical URL of the author's profile on the source platform. */
  profileUrl: string;
  /** Reply count. */
  replyCount: number;
  /** Repost / boost count (includes quotes if applicable). */
  repostCount: number;
  /** Like / favourite count. */
  likeCount: number;
  /** Image attachments. */
  images?: ExternalImage[];
  /** External link card (when there are no images). */
  external?: ExternalExternal;
  /** Small branding icon rendered in the bottom-right. */
  brandIcon?: ReactNode;
}

/** Format an ISO date string into a relative or short date. */
function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = Date.now();
  const diffSec = Math.floor((now - date.getTime()) / 1000);

  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d`;
  if (diffSec < 2592000) return `${Math.floor(diffSec / 604800)}w`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface ExternalPostCardProps {
  post: ExternalPostData;
  className?: string;
}

/**
 * Renders an external social post as a native quote-post card.
 *
 * Clicking the card body navigates to `/i/{postUrl}`.
 * Clicking the avatar or display name navigates to `/i/{profileUrl}`.
 */
export function ExternalPostCard({ post, className }: ExternalPostCardProps) {
  const navigate = useNavigate();

  return (
    <div
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:bg-secondary/40 transition-colors cursor-pointer',
        className,
      )}
      role="link"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        navigate(`/i/${encodeURIComponent(post.postUrl)}`);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          navigate(`/i/${encodeURIComponent(post.postUrl)}`);
        }
      }}
    >
      {/* Images */}
      {post.images && post.images.length > 0 && (
        <div className={cn(
          'w-full overflow-hidden',
          post.images.length > 1 ? 'grid grid-cols-2 gap-px' : '',
        )}>
          {post.images.slice(0, 4).map((img, i) => (
            <img
              key={i}
              src={img.thumb}
              alt={img.alt || ''}
              className={cn(
                'w-full object-cover',
                post.images!.length === 1 ? 'max-h-[300px]' : 'h-[150px]',
              )}
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          ))}
        </div>
      )}

      {/* External link card (if no images) */}
      {!post.images && post.external?.thumb && (
        <div className="w-full overflow-hidden">
          <img
            src={post.external.thumb}
            alt=""
            className="w-full h-[160px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Post content */}
      <div className="px-3 py-2 space-y-1.5">
        {/* Author row */}
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            className="shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/i/${encodeURIComponent(post.profileUrl)}`);
            }}
          >
            <Avatar className="size-5">
              <AvatarImage src={post.avatar} alt={post.displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                {post.displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </button>

          <button
            type="button"
            className="text-sm font-semibold truncate hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/i/${encodeURIComponent(post.profileUrl)}`);
            }}
          >
            {post.displayName}
          </button>

          <span className="text-xs text-muted-foreground truncate">
            @{post.handle}
          </span>

          <span className="text-xs text-muted-foreground shrink-0">
            · {formatDate(post.createdAt)}
          </span>
        </div>

        {/* Text content */}
        {post.text && (
          <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words overflow-hidden line-clamp-6">
            {post.text}
          </p>
        )}

        {/* External link title */}
        {post.external && post.external.title && (
          <div className="text-xs text-muted-foreground truncate">
            {post.external.title}
          </div>
        )}

        {/* Interaction stats */}
        <div className="flex items-center gap-4 pt-0.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageCircle className="size-3.5" />
            {formatNumber(post.replyCount)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Repeat2 className="size-3.5" />
            {formatNumber(post.repostCount)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Heart className="size-3.5" />
            {formatNumber(post.likeCount)}
          </span>

          {/* Platform branding — links to the original post */}
          {post.brandIcon && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              {post.brandIcon}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export function ExternalPostCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border overflow-hidden', className)}>
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="size-5 rounded-full" />
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-10" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
        </div>
        <div className="flex items-center gap-4 pt-0.5">
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
          <Skeleton className="h-3 w-10" />
        </div>
      </div>
    </div>
  );
}
