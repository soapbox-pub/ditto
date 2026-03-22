import { ExternalLink } from 'lucide-react';
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
  /** When true, clicking the card opens the URL in a new tab instead of navigating to the /i/ comment page. */
  externalLink?: boolean;
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
export function LinkPreview({ url, className, hideImage, externalLink }: LinkPreviewProps) {
  const { data, isLoading } = useLinkPreview(url);
  const navigate = useNavigate();

  if (isLoading) {
    return <LinkPreviewSkeleton className={className} />;
  }

  const domain = data?.provider_name || displayDomain(url);
  const image = data?.thumbnail_url;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (externalLink) return; // let the <a> handle it natively
    e.preventDefault();
    navigate(`/i/${encodeURIComponent(url)}`);
  };

  return (
    <a
      href={url}
      target={externalLink ? '_blank' : undefined}
      rel={externalLink ? 'noopener noreferrer' : undefined}
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
        {/* Domain + favicon */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ExternalFavicon url={url} size={14} className="shrink-0" />
          <span className="truncate">{domain}</span>
          <ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
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
