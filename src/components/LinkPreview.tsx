import { ExternalLink, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  url: string;
  className?: string;
  /** When true, hides the thumbnail image in the preview card. */
  hideImage?: boolean;
  /** When true, clicking the card navigates to the /i/ comment page instead of opening the URL externally. */
  navigateToComments?: boolean;
  /** When true, shows an action button (Discuss or Open) in the domain bar. Defaults to true. */
  showActions?: boolean;
}

/** Extracts the display domain from a URL (e.g. "www.example.com" -> "example.com"). */
function displayDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Rich link preview card rendered from OEmbed data. */
export function LinkPreview({ url, className, hideImage, navigateToComments, showActions = true }: LinkPreviewProps) {
  const { data, isLoading } = useLinkPreview(url);
  const navigate = useNavigate();

  if (isLoading) {
    return <LinkPreviewSkeleton className={className} />;
  }

  const domain = data?.provider_name || displayDomain(url);
  const image = data?.thumbnail_url;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!navigateToComments) return; // let the <a> handle it natively
    e.preventDefault();
    navigate(`/i/${encodeURIComponent(url)}`);
  };

  return (
    <a
      href={url}
      target={navigateToComments ? undefined : '_blank'}
      rel={navigateToComments ? undefined : 'noopener noreferrer'}
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:bg-secondary/40 transition-colors',
        className,
      )}
      onClick={handleClick}
    >
      {/* Thumbnail image */}
      {image && !hideImage && (
        <div className="w-full overflow-hidden">
          <img
            src={image}
            alt=""
            className="w-full h-[180px] object-cover"
            loading="lazy"
            onError={(e) => {
              // Hide broken images
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Text content */}
      <div className="px-3.5 py-2.5 space-y-0.5">
        {/* Domain + favicon + action button */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalFavicon url={url} size={14} className="shrink-0" />
          <span className="truncate">{domain}</span>

          {showActions && (navigateToComments ? (
            /* Open externally — card navigates to /i/, so offer the external link */
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full',
                'text-xs text-muted-foreground',
                'hover:bg-primary/10 hover:text-primary transition-colors',
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="size-3" />
              <span>Open</span>
            </a>
          ) : (
            /* Discuss — card opens externally, so offer navigation to /i/ */
            <button
              type="button"
              className={cn(
                'ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full',
                'text-xs text-muted-foreground',
                'hover:bg-primary/10 hover:text-primary transition-colors',
              )}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                navigate(`/i/${encodeURIComponent(url)}`);
              }}
            >
              <MessageSquare className="size-3" />
              <span>Discuss</span>
            </button>
          ))}
        </div>

        {/* Title */}
        {data?.title && (
          <p className="text-sm font-semibold leading-snug line-clamp-2">
            {data.title}
          </p>
        )}

        {/* Author */}
        {data?.author_name && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {data.author_name}
          </p>
        )}
      </div>
    </a>
  );
}

function LinkPreviewSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-2xl border border-border overflow-hidden', className)}>
      <Skeleton className="w-full h-[180px] rounded-none" />
      <div className="px-3.5 py-2.5 space-y-1.5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-full" />
      </div>
    </div>
  );
}
