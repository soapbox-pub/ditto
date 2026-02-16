import { useMemo } from 'react';
import { type NostrEvent } from '@nostrify/nostrify';
import { Link } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

interface NoteContentProps {
  event: NostrEvent;
  className?: string;
}

/** Parses content of text note events so that URLs and hashtags are linkified. */
export function NoteContent({
  event, 
  className, 
}: NoteContentProps) {  
  // Process the content to render mentions, links, etc.
  const content = useMemo(() => {
    const text = event.content;
    
    // Regex to find URLs, Nostr references, and hashtags
    const regex = /(https?:\/\/[^\s]+)|nostr:(npub1|note1|nprofile1|nevent1)([023456789acdefghjklmnpqrstuvwxyz]+)|(#\w+)/g;
    
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let keyCounter = 0;
    
    while ((match = regex.exec(text)) !== null) {
      const [fullMatch, url, nostrPrefix, nostrData, hashtag] = match;
      const index = match.index;
      
      // Add text before this match
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index));
      }
      
      if (url) {
        // Handle URLs
        parts.push(
          <a 
            key={`url-${keyCounter++}`}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 hover:underline break-all"
          >
            {url}
          </a>
        );
      } else if (nostrPrefix && nostrData) {
        // Handle Nostr references
        try {
          const nostrId = `${nostrPrefix}${nostrData}`;
          const decoded = nip19.decode(nostrId);
          
          if (decoded.type === 'npub') {
            const pubkey = decoded.data;
            parts.push(
              <NostrMention key={`mention-${keyCounter++}`} pubkey={pubkey} />
            );
          } else if (decoded.type === 'nprofile') {
            const pubkey = decoded.data.pubkey;
            parts.push(
              <NostrMention key={`mention-${keyCounter++}`} pubkey={pubkey} />
            );
          } else {
            // For other types, just show as a link
            parts.push(
              <Link 
                key={`nostr-${keyCounter++}`}
                to={`/${nostrId}`}
                className="text-blue-500 hover:underline break-all"
              >
                {fullMatch}
              </Link>
            );
          }
        } catch {
          // If decoding fails, just render as text
          parts.push(fullMatch);
        }
      } else if (hashtag) {
        // Handle hashtags
        const tag = hashtag.slice(1); // Remove the #
        parts.push(
          <Link 
            key={`hashtag-${keyCounter++}`}
            to={`/t/${tag}`}
            className="text-blue-500 hover:underline"
          >
            {hashtag}
          </Link>
        );
      }
      
      lastIndex = index + fullMatch.length;
    }
    
    // Add any remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }
    
    // If no special content was found, just use the plain text
    if (parts.length === 0) {
      parts.push(text);
    }
    
    return parts;
  }, [event]);

  return (
    <div className={cn("whitespace-pre-wrap break-words", className)}>
      {content.length > 0 ? content : event.content}
    </div>
  );
}

// Helper component to display user mentions
function NostrMention({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const npub = nip19.npubEncode(pubkey);
  const hasRealName = !!author.data?.metadata?.name;
  const displayName = author.data?.metadata?.name ?? genUserName(pubkey);

  return (
    <Link 
      to={`/${npub}`}
      className={cn(
        "font-medium hover:underline",
        hasRealName 
          ? "text-blue-500" 
          : "text-gray-500 hover:text-gray-700"
      )}
    >
      @{displayName}
    </Link>
  );
}