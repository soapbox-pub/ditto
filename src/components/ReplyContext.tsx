import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

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
    <div className={className || 'flex items-center flex-wrap gap-x-1 text-sm text-muted-foreground mt-2 mb-1'}>
      <span>Replying to</span>
      {displayPubkeys.map((pubkey, index) => (
        <span key={pubkey} className="inline-flex items-center gap-1">
          <ReplyAuthor pubkey={pubkey} />
          {index < displayPubkeys.length - 1 && <span>and</span>}
        </span>
      ))}
      {pubkeys.length > 2 && (
        <span className="text-muted-foreground">
          and {pubkeys.length - 2} other{pubkeys.length - 2 !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function ReplyAuthor({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);

  if (author.isLoading) {
    return <Skeleton className="h-3.5 w-20 inline-block" />;
  }

  return (
    <Link
      to={`/${nip19.npubEncode(pubkey)}`}
      className="text-primary hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      @{name}
    </Link>
  );
}
