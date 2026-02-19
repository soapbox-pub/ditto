import { ExternalLink } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { cn } from '@/lib/utils';

interface LinkPreviewProps {
  url: string;
  className?: string;
}

/** Extracts the display domain from a URL (e.g. "www.example.com" → "example.com"). */
function displayDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Rich link preview card showing OG image, title, description, and domain. */
export function LinkPreview({ url, className }: LinkPreviewProps) {
  const { data, isLoading } = useLinkPreview(url);

  if (isLoading) {
    return <LinkPreviewSkeleton className={className} />;
  }

  if (!data) {
    return null;
  }

  const domain = data.siteName || displayDomain(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'group block rounded-2xl border border-border overflow-hidden',
        'hover:bg-secondary/40 transition-colors',
        className,
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* OG image */}
      {data.image && (
        <div className="w-full overflow-hidden">
          <img
            src={data.image}
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
          {data.favicon && (
            <img
              src={data.favicon}
              alt=""
              className="size-3.5 rounded-sm"
              loading="lazy"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <span className="truncate">{domain}</span>
          <ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Title */}
        {data.title && (
          <p className="text-sm font-semibold leading-snug line-clamp-2">
            {data.title}
          </p>
        )}

        {/* Description */}
        {data.description && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
            {data.description}
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
