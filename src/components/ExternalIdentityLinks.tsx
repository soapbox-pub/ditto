import { Link2 } from 'lucide-react';
import { useIntl } from 'react-intl';

import { ExternalFavicon } from '@/components/ExternalFavicon';
import { EXTERNAL_IDENTITY_PLATFORM_NAMES, type ExternalIdentity } from '@/lib/externalIdentities';
import { cn } from '@/lib/utils';

interface ExternalIdentityLinksProps {
  identities: ExternalIdentity[];
  className?: string;
}

/**
 * Row of links to a profile's accounts on other platforms (NIP-39), each
 * marked with the platform's favicon. Claims are shown as declared; proofs
 * are not verified.
 */
export function ExternalIdentityLinks({ identities, className }: ExternalIdentityLinksProps) {
  const intl = useIntl();

  if (identities.length === 0) return null;

  return (
    <ul className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {identities.map((identity) => {
        const platform = EXTERNAL_IDENTITY_PLATFORM_NAMES[identity.platform];
        return (
          <li key={`${identity.platform}:${identity.identity}`} className="min-w-0 max-w-full">
            <a
              href={identity.url}
              target="_blank"
              rel="noopener noreferrer"
              title={identity.label === platform ? platform : intl.formatMessage(
                { id: 'profile.externalIdentity.title', defaultMessage: '{label} on {platform}' },
                { label: identity.label, platform },
              )}
              className="flex min-w-0 items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ExternalFavicon
                url={identity.url}
                size={14}
                className="shrink-0"
                fallback={<Link2 className="size-3.5" aria-hidden />}
              />
              <span className="truncate">{identity.label}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
