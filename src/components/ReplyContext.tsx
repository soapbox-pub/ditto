import { Link } from 'react-router-dom';

import { EmbeddedNote } from '@/components/EmbeddedNote';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { useProfileUrl } from '@/hooks/useProfileUrl';

interface ReplyContextProps {
  pubkeys: string[];
  /** Hex event ID of the parent post being replied to. */
  parentEventId?: string;
  className?: string;
}

/**
 * Displays "Replying to @username" or "Replying to @user1 and @user2" context for reply posts.
 * When parentEventId is provided, hovering over the line shows an embedded preview of the parent post.
 * Used consistently across NoteCard and notification views.
 */
export function ReplyContext({ pubkeys, parentEventId, className }: ReplyContextProps) {
  // Filter out any undefined/empty pubkeys defensively
  const validPubkeys = pubkeys.filter(Boolean);
  // Show max 2 authors for cleaner UI
  const displayPubkeys = validPubkeys.slice(0, 2);

  const replyingToLabel = parentEventId ? (
    <HoverCard openDelay={300} closeDelay={150}>
      <HoverCardTrigger asChild>
        <span className="shrink-0 cursor-pointer hover:underline">Replying to</span>
      </HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={4}
        className="w-80 p-0 rounded-2xl shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <EmbeddedNote eventId={parentEventId} className="border-0 rounded-none" disableHoverCards />
      </HoverCardContent>
    </HoverCard>
  ) : (
    <span className="shrink-0">Replying to</span>
  );

  return (
    <div className={className || 'flex items-center flex-wrap gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      {replyingToLabel}
      {displayPubkeys.map((pubkey, index) => (
        <span key={pubkey} className="inline-flex items-center gap-1 min-w-0">
          <ReplyAuthor pubkey={pubkey} />
          {index < displayPubkeys.length - 1 && <span className="shrink-0">and</span>}
        </span>
      ))}
      {validPubkeys.length > 2 && (
        <span className="text-muted-foreground shrink-0">
          and {validPubkeys.length - 2} other{validPubkeys.length - 2 !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function ReplyAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
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
        @{name}
      </Link>
    </ProfileHoverCard>
  );
}
