import { profileName } from '@/lib/getDisplayName';
import { Link } from 'react-router-dom';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { EmojifiedText } from '@/components/CustomEmoji';
import { cn } from '@/lib/utils';

/**
 * Inline @mention link for a pubkey, with a profile hover card.
 *
 * Renders the author's display name (with NIP-30 custom emoji) prefixed with
 * `@`, linked to their profile. Used by NoteContent and BioContent to render
 * npub/nprofile references as clickable mentions.
 */
export function NostrMention({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const hasRealName = !!profileName(author.data?.metadata);
  const displayName = profileName(author.data?.metadata) ?? 'Anonymous';
  const profileUrl = useProfileUrl(pubkey, author.data?.metadata);

  return (
    <ProfileHoverCard pubkey={pubkey} asChild>
      <Link
        to={profileUrl}
        className={cn(
          'font-medium hover:underline',
          hasRealName
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        @{author.data?.event ? (
          <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
        ) : displayName}
      </Link>
    </ProfileHoverCard>
  );
}
