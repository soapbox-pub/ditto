import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { formatNip05Display, getNip05Domain, getNip05User } from '@/lib/nip05';
import { useNip05Verify } from '@/hooks/useNip05Verify';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';

interface Nip05BadgeProps {
  nip05: string;
  /** The pubkey of the profile claiming this NIP-05 identifier. Used for verification. */
  pubkey: string;
  className?: string;
  /** Size of the favicon in pixels (default: 16) */
  iconSize?: number;
  /** Show a checkmark before the identifier. Default: false. */
  showCheck?: boolean;
}

/**
 * Displays a NIP-05 identifier with its domain favicon, but only after verifying
 * that the identifier resolves to the expected pubkey via the domain's
 * .well-known/nostr.json endpoint.
 *
 * - `_@domain.com` renders as `@domain.com` (domain is clickable → domain feed)
 * - `user@domain.com` renders as `@user@domain.com` (domain part is clickable → domain feed)
 * - The domain text and favicon are both clickable links to `/feed/{domain}`
 * - Returns null while verifying or if verification fails.
 */
/**
 * Renders a verified NIP-05 identifier as plain text (e.g. in compact UI contexts).
 * Only renders when the NIP-05 identifier has been verified against the pubkey.
 * Returns null while verifying or if verification fails.
 */
export function VerifiedNip05Text({
  nip05,
  pubkey,
  className,
}: {
  nip05: string;
  pubkey: string;
  className?: string;
}) {
  const { data: verified, isPending } = useNip05Verify(nip05, pubkey);
  if (isPending) return <Skeleton className={cn('h-3 w-24 inline-block', className)} />;
  if (!verified) return null;
  return (
    <span className={className}>@{formatNip05Display(nip05)}</span>
  );
}

export function Nip05Badge({ nip05, pubkey, className, iconSize = 16, showCheck = false }: Nip05BadgeProps) {
  const { data: verified, isPending } = useNip05Verify(nip05, pubkey);

  if (isPending) {
    return (
      <span className={cn('inline-flex items-center gap-1', className)}>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="rounded-full" style={{ width: iconSize, height: iconSize }} />
      </span>
    );
  }

  if (!verified) return null;

  const domain = getNip05Domain(nip05);
  const user = getNip05User(nip05);
  const isDefaultUser = user === '_';

  return (
    <span className={cn('inline-flex items-center min-w-0', className)}>
      {showCheck && <CheckCircle2 className="size-3.5 text-primary shrink-0 mr-1 mt-[0.2rem]" />}
      {isDefaultUser ? (
        <Link
          to={`/feed/${domain}`}
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
              to={`/feed/${domain}`}
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
          to={`/feed/${domain}`}
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
