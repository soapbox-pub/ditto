import { Heart, MessageCircle, Repeat2 } from 'lucide-react';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useBlueskyPost } from '@/hooks/useBlueskyPost';
import { cn } from '@/lib/utils';

interface BlueskyEmbedProps {
  /** Handle or DID of the post author. */
  author: string;
  /** Record key (rkey) of the post. */
  rkey: string;
  className?: string;
}

/** Format a count for display (e.g. 1234 → "1.2K"). */
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/** Format a Bluesky ISO date string into a relative or short date. */
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

/**
 * Renders a Bluesky post as a native quote-post card, fetching data from
 * the public Bluesky API instead of using an iframe.
 */
export function BlueskyEmbed({ author, rkey, className }: BlueskyEmbedProps) {
  const { data: post, isLoading, isError } = useBlueskyPost(author, rkey);

  if (isLoading) {
    return <BlueskyEmbedSkeleton className={className} />;
  }

  if (isError || !post) {
    return null;
  }

  const postUrl = `https://bsky.app/profile/${post.author.handle}/post/${rkey}`;
  const displayName = post.author.displayName || post.author.handle;

  return (
    <a
      href={postUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:bg-secondary/40 transition-colors',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
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
          <Avatar className="size-5 shrink-0">
            <AvatarImage src={post.author.avatar} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <span className="text-sm font-semibold truncate">
            {displayName}
          </span>

          <span className="text-xs text-muted-foreground truncate">
            @{post.author.handle}
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

        {/* External link title (shown as inline context if text also exists) */}
        {post.external && post.external.title && (
          <div className="text-xs text-muted-foreground truncate">
            {post.external.title}
          </div>
        )}

        {/* Interaction stats */}
        <div className="flex items-center gap-4 pt-0.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageCircle className="size-3.5" />
            {formatCount(post.replyCount)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Repeat2 className="size-3.5" />
            {formatCount(post.repostCount + post.quoteCount)}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Heart className="size-3.5" />
            {formatCount(post.likeCount)}
          </span>

          {/* Bluesky branding */}
          <span className="ml-auto text-[11px] text-muted-foreground flex items-center gap-1">
            <BlueskyLogo className="size-3.5" />
          </span>
        </div>
      </div>
    </a>
  );
}

/** Bluesky butterfly logo as an inline SVG. */
function BlueskyLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 600 530"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Bluesky"
    >
      <path d="m135.72 44.03c66.496 49.921 138.02 151.14 164.28 205.46 26.262-54.316 97.782-155.54 164.28-205.46 47.98-36.021 125.72-63.892 125.72 24.795 0 17.712-10.155 148.79-16.111 170.07-20.703 73.984-96.144 92.854-163.25 81.433 117.3 19.964 147.14 86.092 82.697 152.22-122.39 125.59-175.91-31.511-189.63-71.766-2.514-7.3797-3.6904-10.832-3.7077-7.8964-0.0174-2.9357-1.1937 0.51669-3.7077 7.8964-13.714 40.255-67.233 197.36-189.63 71.766-64.444-66.128-34.605-132.26 82.697-152.22-67.108 11.421-142.55-7.4491-163.25-81.433-5.9562-21.282-16.111-152.36-16.111-170.07 0-88.687 77.742-60.816 125.72-24.795z" />
    </svg>
  );
}

function BlueskyEmbedSkeleton({ className }: { className?: string }) {
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
