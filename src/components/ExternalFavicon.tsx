import { useAppContext } from '@/hooks/useAppContext';
import { faviconUrl } from '@/lib/faviconUrl';
import { cn } from '@/lib/utils';
import { ReactNode, useMemo } from 'react';

interface ExternalFaviconProps {
  /** The URL to fetch the favicon for */
  url: string | URL | undefined;
  /** Size of the favicon in pixels */
  size?: number;
  /** Fallback element to display if favicon fails to load */
  fallback?: ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * ExternalFavicon component that fetches and displays a favicon for a given URL
 * using the configurable favicon service from app settings.
 */
export function ExternalFavicon({
  url,
  size = 16,
  fallback,
  className = '',
}: ExternalFaviconProps) {
  const { config } = useAppContext();

  // Generate the favicon URL using the configured template
  const faviconSrc = useMemo(() => {
    if (!url) return;
    try {
      const parsedUrl = new URL(url);

      // Strip `ai.` and `api.` subdomains for a better chance at finding a favicon
      parsedUrl.hostname = parsedUrl.hostname.replace(/^(ai\.|api\.|enclave\.)/, '');

      // Normalize the URL to ensure it has a protocol
      return faviconUrl({ template: config.faviconUrl, url: parsedUrl });
    } catch {
      return;
    }
  }, [url, config.faviconUrl]);

  // If faviconSrc is not available, render the fallback directly
  if (!faviconSrc) {
    return (
      <span className={cn('inline-flex items-center justify-center', className)}>
        <span>{fallback}</span>
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center justify-center', className)}>
      <img
        src={faviconSrc}
        alt=""
        className="object-contain"
        style={{ width: size, height: size }}
        onError={(e) => {
          // Hide the image and show the fallback on error
          e.currentTarget.style.display = 'none';
          const fallbackElement = e.currentTarget.nextElementSibling as HTMLElement;
          if (fallbackElement) {
            fallbackElement.style.display = 'inline-block';
          }
        }}
      />
      {fallback && (
        <span style={{ display: 'none' }}>
          {fallback}
        </span>
      )}
    </span>
  );
}
