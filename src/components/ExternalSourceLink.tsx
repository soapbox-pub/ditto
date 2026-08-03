import { ExternalLink } from 'lucide-react';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { openUrl } from '@/lib/downloadFile';
import { externalUrl, displayHost } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface ExternalSourceLinkProps {
  /** Raw source URL the embed was resolved from. */
  url: string | undefined;
  className?: string;
}

/**
 * Favicon + hostname chip shown on an embed card that was resolved from a
 * URL on another host (e.g. a kind 30023 article linked via habla.news).
 * Clicking it opens the original source (Capacitor-safe). Renders nothing for
 * same-host, invalid, or non-HTTPS URLs.
 */
export function ExternalSourceLink({ url, className }: ExternalSourceLinkProps) {
  const safe = externalUrl(url);
  if (!safe) return null;

  return (
    <button
      type="button"
      className={cn(
        'flex items-center gap-1 px-2 py-0.5 rounded-full max-w-full min-w-0',
        'text-xs text-muted-foreground',
        'hover:bg-primary/10 hover:text-primary transition-colors',
        className,
      )}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        openUrl(safe);
      }}
    >
      <ExternalFavicon url={safe} size={14} className="shrink-0" />
      <span className="truncate">{displayHost(safe)}</span>
      <ExternalLink className="size-3 shrink-0" />
    </button>
  );
}
