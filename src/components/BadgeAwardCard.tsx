import type { NostrEvent } from '@nostrify/nostrify';
import { Award } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { AcceptBadgeButton } from '@/components/AcceptBadgeButton';
import { BadgeContent } from '@/components/BadgeContent';
import { EmojifiedText } from '@/components/CustomEmoji';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useBadgeDefinitions } from '@/hooks/useBadgeDefinitions';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import {
  BADGE_DEFINITION_KIND,
  getBadgeRecipients,
  isAwardedTo,
  parseBadgeATag,
  unslugify,
} from '@/lib/badgeUtils';
import { genUserName } from '@/lib/genUserName';

interface BadgeAwardCardProps {
  /** The kind 8 badge award event. */
  event: NostrEvent;
}

/**
 * Feed card for NIP-58 badge award events (kind 8). Shows a linked recipient
 * row, the full badge showcase (via `BadgeContent`), and an Accept button when
 * the logged-in user is a recipient. The issuer's avatar and name are rendered
 * by the surrounding `NoteCard`.
 */
export function BadgeAwardCard({ event }: BadgeAwardCardProps) {
  const { user } = useCurrentUser();

  const recipients = useMemo(() => getBadgeRecipients(event), [event]);
  const parsed = useMemo(() => parseBadgeATag(event), [event]);

  // NIP-58: only the badge owner can validly award their own badge. Ignore
  // definitions whose a-tag pubkey doesn't match the award's issuer.
  const validParsed = parsed && parsed.pubkey === event.pubkey ? parsed : undefined;
  const badgeRef = useMemo(() => (validParsed ? [validParsed] : []), [validParsed]);
  const { badgeMap } = useBadgeDefinitions(badgeRef);

  const aTag = validParsed
    ? `${BADGE_DEFINITION_KIND}:${validParsed.pubkey}:${validParsed.identifier}`
    : undefined;
  const definition = aTag ? badgeMap.get(aTag) : undefined;
  const definitionEvent = definition?.event;

  const badgeNaddr = useMemo(
    () =>
      validParsed
        ? nip19.naddrEncode({
            kind: BADGE_DEFINITION_KIND,
            pubkey: validParsed.pubkey,
            identifier: validParsed.identifier,
          })
        : undefined,
    [validParsed],
  );

  const isRecipient = user ? isAwardedTo(event, user.pubkey) : false;
  const firstRecipient = recipients[0];
  const extraRecipientCount = Math.max(recipients.length - 1, 0);

  return (
    <div className="mt-1 space-y-2">
      {/* Recipient(s) row — "to @Alice" / "to @Alice and 2 others" */}
      {firstRecipient && (
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span>to</span>
          <RecipientName pubkey={firstRecipient} />
          {extraRecipientCount > 0 && (
            <span className="text-muted-foreground">
              and {extraRecipientCount}{' '}
              {extraRecipientCount === 1 ? 'other' : 'others'}
            </span>
          )}
        </div>
      )}

      {/* Badge showcase — click-through to the badge detail page */}
      {definitionEvent ? (
        badgeNaddr ? (
          <Link
            to={`/${badgeNaddr}`}
            className="block"
            onClick={(e) => e.stopPropagation()}
          >
            <BadgeContent event={definitionEvent} />
          </Link>
        ) : (
          <BadgeContent event={definitionEvent} />
        )
      ) : (
        <BadgeShowcaseFallback
          name={validParsed ? unslugify(validParsed.identifier) : undefined}
          href={badgeNaddr ? `/${badgeNaddr}` : undefined}
        />
      )}

      {/* Accept button — only shown when the logged-in user is a recipient */}
      {isRecipient && (
        <div className="flex justify-center pt-1">
          <AcceptBadgeButton awardEvent={event} prominent />
        </div>
      )}
    </div>
  );
}

/** Linked display name for a recipient pubkey, with loading skeleton and hover card. */
function RecipientName({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  const url = useProfileUrl(pubkey, metadata);

  if (author.isLoading) {
    return <Skeleton className="h-3.5 w-24 inline-block" />;
  }

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link
        to={url}
        className="font-semibold text-foreground hover:underline truncate max-w-[14rem]"
        onClick={(e) => e.stopPropagation()}
      >
        {author.data?.event ? (
          <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
        ) : (
          displayName
        )}
      </Link>
    </ProfileHoverCard>
  );
}

/** Fallback shown while the badge definition is loading or missing. */
function BadgeShowcaseFallback({
  name,
  href,
}: {
  name: string | undefined;
  href: string | undefined;
}) {
  const body = (
    <div className="mt-3 rounded-2xl border border-dashed border-border py-10 px-6 flex flex-col items-center gap-3">
      <div className="size-20 rounded-2xl bg-gradient-to-br from-primary/10 via-primary/5 to-transparent flex items-center justify-center">
        <Award className="size-8 text-primary/40" />
      </div>
      {name ? (
        <p className="text-sm font-semibold text-center">{name}</p>
      ) : (
        <Skeleton className="h-4 w-32" />
      )}
    </div>
  );

  if (!href) return body;

  return (
    <Link to={href} className="block" onClick={(e) => e.stopPropagation()}>
      {body}
    </Link>
  );
}
