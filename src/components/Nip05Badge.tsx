import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { getNip05Domain, getNip05User } from '@/lib/nip05';

interface Nip05BadgeProps {
  nip05: string;
  className?: string;
  /** Size of the favicon in pixels (default: 16) */
  iconSize?: number;
}

/**
 * Displays a NIP-05 identifier with its domain favicon.
 * - `_@domain.com` renders as `@domain.com` (domain is clickable → domain feed)
 * - `user@domain.com` renders as `@user@domain.com` (domain part is clickable → domain feed)
 * - The domain text and favicon are both clickable links to `/timeline/{domain}`
 */
export function Nip05Badge({ nip05, className, iconSize = 16 }: Nip05BadgeProps) {
  const domain = getNip05Domain(nip05);
  const user = getNip05User(nip05);
  const isDefaultUser = user === '_';

  return (
    <span className={cn('inline-flex items-center min-w-0', className)}>
      {isDefaultUser ? (
        <Link
          to={`/timeline/${domain}`}
          className="truncate min-w-0 hover:underline"
          onClick={(e) => e.stopPropagation()}
          title={`View ${domain} feed`}
        >
          @{domain}
        </Link>
      ) : (
        <>
          <span className="truncate min-w-0">@{user}@</span>
          {domain && (
            <Link
              to={`/timeline/${domain}`}
              className="shrink-0 hover:underline"
              onClick={(e) => e.stopPropagation()}
              title={`View ${domain} feed`}
            >
              {domain}
            </Link>
          )}
        </>
      )}
      {domain && (
        <Link
          to={`/timeline/${domain}`}
          className="inline-flex items-center shrink-0 ml-1 hover:opacity-80 transition-opacity"
          onClick={(e) => e.stopPropagation()}
          title={`View ${domain} feed`}
        >
          <ExternalFavicon url={`https://${domain}`} size={iconSize} className="shrink-0" />
        </Link>
      )}
    </span>
  );
}
