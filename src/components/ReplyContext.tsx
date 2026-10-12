import { FormattedMessage, useIntl } from 'react-intl';
import { Link } from 'react-router-dom';

import { EmbeddedNote } from '@/components/EmbeddedNote';
import { EmojifiedText } from '@/components/CustomEmoji';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';

interface ReplyContextProps {
  pubkeys: string[];
  /** Hex event ID of the parent post being replied to. */
  parentEventId?: string;
  /** Relay URL hint for fetching the parent event. */
  parentRelayHint?: string;
  /** Author pubkey hint for NIP-65 outbox resolution of the parent event. */
  parentAuthorHint?: string;
  /** Leading verb phrase before the author names. Defaults to "Replying to";
   *  pass e.g. "Zapping" to reuse this row for a zap's target. */
  label?: string;
  className?: string;
}

/**
 * Displays "Replying to @username" or "Replying to @user1 and @user2" context for reply posts.
 * When parentEventId is provided, hovering over the line shows an embedded preview of the parent post.
 * Used consistently across NoteCard and notification views.
 */
export function ReplyContext({ pubkeys, parentEventId, parentRelayHint, parentAuthorHint, label: labelProp, className }: ReplyContextProps) {
  const intl = useIntl();
  const label = labelProp ?? intl.formatMessage({ id: 'replyContext.replyingTo', defaultMessage: 'Replying to' });
  // Filter out any undefined/empty pubkeys defensively
  const validPubkeys = pubkeys.filter(Boolean);
  // Show max 2 authors for cleaner UI
  const displayPubkeys = validPubkeys.slice(0, 2);

  const replyingToLabel = parentEventId ? (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className="shrink-0 cursor-pointer hover:underline">{label}</span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-80 p-0 rounded-2xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <EmbeddedNote
          eventId={parentEventId}
          relays={parentRelayHint ? [parentRelayHint] : undefined}
          authorHint={parentAuthorHint}
          className="border-0 rounded-none"
          disableHoverCards
        />
      </HoverCardContent>
    </HoverCard>
  ) : (
    <span className="shrink-0">{label}</span>
  );

  return (
    <div className={className || 'flex items-center flex-wrap gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      {replyingToLabel}
      {displayPubkeys.length === 1 ? (
        <ReplyAuthor pubkey={displayPubkeys[0]} />
      ) : displayPubkeys.length === 2 ? (
        <FormattedMessage
          id="replyContext.authors"
          defaultMessage="{first} and {second}{others, plural, =0 {} one { and # other} other { and # others}}"
          values={{
            first: <ReplyAuthor pubkey={displayPubkeys[0]} />,
            second: <ReplyAuthor pubkey={displayPubkeys[1]} />,
            others: validPubkeys.length - 2,
          }}
        />
      ) : null}
    </div>
  );
}

function ReplyAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const intl = useIntl();
  const name = author.data?.metadata?.name || author.data?.metadata?.display_name || intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  const profileUrl = useProfileUrl(pubkey, author.data?.metadata);

  if (author.isLoading) {
    return <Skeleton className="h-3.5 w-20 inline-block" />;
  }

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link
        to={profileUrl}
        className="text-primary hover:underline truncate max-w-[200px] inline-block align-bottom"
        onClick={(e) => e.stopPropagation()}
      >
        @<EmojifiedText tags={author.data?.event?.tags ?? []}>{name}</EmojifiedText>
      </Link>
    </ProfileHoverCard>
  );
}
