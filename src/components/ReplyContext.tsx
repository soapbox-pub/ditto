import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';

interface ReplyContextProps {
  pubkey: string;
  className?: string;
}

/**
 * Displays "Replying to @username" context for reply posts.
 * Used consistently across NoteCard and notification views.
 */
export function ReplyContext({ pubkey, className }: ReplyContextProps) {
  const author = useAuthor(pubkey);
  const name = author.data?.metadata?.name || genUserName(pubkey);

  return (
    <div className={className || 'flex items-center text-sm text-muted-foreground mt-2 mb-1'}>
      <span className="mr-1">Replying to</span>
      {author.isLoading ? (
        <Skeleton className="h-3.5 w-20 inline-block" />
      ) : (
        <Link to={`/${nip19.npubEncode(pubkey)}`} className="text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          @{name}
        </Link>
      )}
    </div>
  );
}
