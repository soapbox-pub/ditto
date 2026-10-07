import { Globe, Link2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useIntl } from 'react-intl';

import { ExternalFavicon } from '@/components/ExternalFavicon';
import { EXTERNAL_IDENTITY_PLATFORM_NAMES, type ExternalIdentity } from '@/lib/externalIdentities';
import { cn } from '@/lib/utils';

interface ExternalIdentityLinksProps {
  identities: ExternalIdentity[];
  /** Sanitized website URL from the profile's kind 0, listed first. */
  website?: string;
  className?: string;
}

/**
 * Row of links to a profile's website and accounts on other platforms
 * (NIP-39), each marked with the site's favicon. Claims are shown as
 * declared; proofs are not verified.
 */
export function ExternalIdentityLinks({ identities, website, className }: ExternalIdentityLinksProps) {
  const intl = useIntl();

  if (identities.length === 0 && !website) return null;

  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1', className)}>
      {website && (
        <ProfileLink
          url={website}
          label={website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
          fallback={<Globe className="size-3.5" aria-hidden />}
        />
      )}
      {identities.map((identity) => {
        const platform = EXTERNAL_IDENTITY_PLATFORM_NAMES[identity.platform];
        return (
          <ProfileLink
            key={`${identity.platform}:${identity.identity}`}
            url={identity.url}
            label={identity.label}
            title={identity.label === platform ? platform : intl.formatMessage(
              { id: 'profile.externalIdentity.title', defaultMessage: '{label} on {platform}' },
              { label: identity.label, platform },
            )}
            fallback={<Link2 className="size-3.5" aria-hidden />}
          />
        );
      })}
    </ul>
  );
}

interface ProfileLinkProps {
  url: string;
  label: string;
  title?: string;
  fallback: ReactNode;
}

function ProfileLink({ url, label, title, fallback }: ProfileLinkProps) {
  return (
    <li className="min-w-0 max-w-full">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="group flex min-w-0 items-center gap-1.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ExternalFavicon url={url} size={14} className="shrink-0" fallback={fallback} />
        <span className="truncate group-hover:underline">{label}</span>
      </a>
    </li>
  );
}
