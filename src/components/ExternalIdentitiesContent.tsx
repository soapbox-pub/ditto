import { useMemo } from 'react';
import { FormattedMessage } from 'react-intl';
import { Link2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { EmbeddedCardShell } from '@/components/EmbeddedCardShell';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { ExternalIdentityLinks } from '@/components/ExternalIdentityLinks';
import { encodeEventAddress } from '@/lib/encodeEvent';
import {
  EXTERNAL_IDENTITY_PLATFORM_NAMES,
  type ExternalIdentity,
  parseExternalIdentities,
} from '@/lib/externalIdentities';

/** Favicons previewed in the embed. */
const EMBED_FAVICON_LIMIT = 6;

interface ExternalIdentitiesContentProps {
  event: NostrEvent;
  /** Detail-page rendering: one row per account, with a link to its proof. */
  expanded?: boolean;
}

/**
 * Card for kind 10011 (NIP-39 external identities).
 *
 * Everything lives in `i` tags, so the card leads with an account count. The
 * feed shows the same favicon pills as the profile header; the detail page
 * gives each account a row with its platform and a link to the proof, so a
 * reader can check a claim themselves — Ditto does not verify them.
 */
export function ExternalIdentitiesContent({ event, expanded }: ExternalIdentitiesContentProps) {
  const identities = useMemo(() => parseExternalIdentities(event), [event]);

  if (identities.length === 0) {
    return (
      <div className="mt-2 rounded-xl border border-dashed border-border px-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage id="externalIdentities.empty" defaultMessage="No linked accounts." />
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Link2 className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="text-[15px] font-semibold leading-snug">
          <FormattedMessage
            id="externalIdentities.count"
            defaultMessage="{count, plural, one {# linked account} other {# linked accounts}}"
            values={{ count: identities.length }}
          />
        </span>
      </div>

      {expanded ? (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border">
          {identities.map((identity) => (
            <ExternalIdentityRow key={`${identity.platform}:${identity.identity}`} identity={identity} />
          ))}
        </ul>
      ) : (
        <ExternalIdentityLinks identities={identities} />
      )}
    </div>
  );
}

/** Detail row: favicon, handle, platform, and a proof link. */
function ExternalIdentityRow({ identity }: { identity: ExternalIdentity }) {
  const platform = EXTERNAL_IDENTITY_PLATFORM_NAMES[identity.platform];

  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <ExternalFavicon
        url={identity.url}
        size={20}
        className="size-8 shrink-0 rounded-lg bg-muted"
        fallback={<Link2 className="size-4 text-muted-foreground" aria-hidden />}
      />
      <div className="min-w-0 flex-1">
        <a
          href={identity.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block truncate text-sm font-semibold hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {identity.label}
        </a>
        <p className="truncate text-xs text-muted-foreground">{platform}</p>
      </div>
      {/* Telegram and Discord have no profile URL, so the handle already links
          to the proof — a second link to the same place would be noise. */}
      {identity.proofUrl !== identity.url && (
        <a
          href={identity.proofUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <FormattedMessage id="externalIdentities.proof" defaultMessage="Proof" />
        </a>
      )}
    </li>
  );
}

interface EmbeddedExternalIdentitiesCardProps {
  event: NostrEvent;
  className?: string;
  disableHoverCards?: boolean;
}

/**
 * Compact embedded card for kind 10011. Shows a count and a row of platform
 * favicons — not links, since the whole card navigates to the event.
 */
export function EmbeddedExternalIdentitiesCard({ event, className, disableHoverCards }: EmbeddedExternalIdentitiesCardProps) {
  const identities = useMemo(() => parseExternalIdentities(event), [event]);
  const nip19Id = useMemo(() => encodeEventAddress(event), [event]);

  return (
    <EmbeddedCardShell
      pubkey={event.pubkey}
      createdAt={event.created_at}
      navigateTo={nip19Id}
      className={className}
      disableHoverCards={disableHoverCards}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Link2 className="size-3.5 shrink-0 text-primary" aria-hidden />
        <p className="line-clamp-1 text-sm font-semibold leading-snug">
          <FormattedMessage
            id="externalIdentities.embedTitle"
            defaultMessage="Linked accounts · {count, plural, one {# account} other {# accounts}}"
            values={{ count: identities.length }}
          />
        </p>
      </div>

      {identities.length > 0 && (
        <div className="flex items-center gap-1.5">
          {identities.slice(0, EMBED_FAVICON_LIMIT).map((identity) => (
            <ExternalFavicon
              key={`${identity.platform}:${identity.identity}`}
              url={identity.url}
              size={14}
              className="size-6 rounded-full border border-border bg-background"
              fallback={<Link2 className="size-3 text-muted-foreground" aria-hidden />}
            />
          ))}
        </div>
      )}
    </EmbeddedCardShell>
  );
}
