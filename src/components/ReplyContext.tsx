import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { getProfileUrl } from '@/lib/profileUrl';

interface ReplyContextProps {
  pubkeys: string[];
  className?: string;
}

/**
 * Displays "Replying to @username" or "Replying to @user1 and @user2" context for reply posts.
 * Used consistently across NoteCard and notification views.
 */
export function ReplyContext({ pubkeys, className }: ReplyContextProps) {
  // Show max 2 authors for cleaner UI
  const displayPubkeys = pubkeys.slice(0, 2);

  return (
    <div className={className || 'flex items-center flex-wrap gap-x-1 text-sm text-muted-foreground mt-2 mb-1 min-w-0 overflow-hidden'}>
      <span className="shrink-0">Replying to</span>
      {displayPubkeys.map((pubkey, index) => (
        <span key={pubkey} className="inline-flex items-center gap-1 min-w-0">
          <ReplyAuthor pubkey={pubkey} />
          {index < displayPubkeys.length - 1 && <span className="shrink-0">and</span>}
        </span>
      ))}
      {pubkeys.length > 2 && (
        <span className="text-muted-foreground shrink-0">
          and {pubkeys.length - 2} other{pubkeys.length - 2 !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function ReplyAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);
  const profileUrl = getProfileUrl(pubkey, author.data?.metadata);

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
