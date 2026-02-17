import { Link, useNavigate } from 'react-router-dom';
import { Play, Heart, MessageCircle, Repeat2, MoreHorizontal } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import { nip19 } from 'nostr-tools';
import { useMemo, useState, useRef } from 'react';
import type { NostrEvent } from '@nostrify/nostrify';

interface VineCardProps {
  event: NostrEvent;
  className?: string;
}

/** Parse imeta tag into a structured object. */
function parseImeta(tags: string[][]): { url?: string; mime?: string; thumbnail?: string; dim?: string; blurhash?: string } {
  const imetaTag = tags.find(([name]) => name === 'imeta');
  if (!imetaTag) return {};

  const result: Record<string, string> = {};
  for (let i = 1; i < imetaTag.length; i++) {
    const part = imetaTag[i];
    const spaceIdx = part.indexOf(' ');
    if (spaceIdx === -1) continue;
    const key = part.slice(0, spaceIdx);
    const value = part.slice(spaceIdx + 1);
    // Map imeta keys
    if (key === 'url') result.url = value;
    else if (key === 'm') result.mime = value;
    else if (key === 'image') result.thumbnail = value;
    else if (key === 'dim') result.dim = value;
    else if (key === 'blurhash') result.blurhash = value;
  }
  return result;
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

export function VineCard({ event, className }: VineCardProps) {
  const navigate = useNavigate();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name || genUserName(event.pubkey);
  const npub = useMemo(() => nip19.npubEncode(event.pubkey), [event.pubkey]);

  const imeta = useMemo(() => parseImeta(event.tags), [event.tags]);
  const title = getTag(event.tags, 'title');
  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const handlePlayToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const neventId = useMemo(() => {
    const dTag = getTag(event.tags, 'd');
    if (dTag) {
      return nip19.naddrEncode({ kind: event.kind, pubkey: event.pubkey, identifier: dTag });
    }
    return nip19.neventEncode({ id: event.id, author: event.pubkey });
  }, [event]);

  return (
    <article
      className={cn(
        'border-b border-border hover:bg-secondary/30 transition-colors',
        className,
      )}
    >
      {/* Author header */}
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Link to={`/${npub}`} className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <Avatar className="size-10">
            <AvatarImage src={metadata?.picture} alt={displayName} />
            <AvatarFallback className="bg-primary/20 text-primary text-sm">
              {displayName[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-sm">
            <Link
              to={`/${npub}`}
              className="font-bold hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {displayName}
            </Link>
            <span className="text-muted-foreground shrink-0">·</span>
            <span className="text-muted-foreground shrink-0">{timeAgo(event.created_at)}</span>
          </div>
          {title && (
            <p className="text-[15px] mt-0.5 line-clamp-2">{title}</p>
          )}
        </div>
      </div>

      {/* Video */}
      {imeta.url && (
        <div
          className="relative bg-black cursor-pointer"
          onClick={handlePlayToggle}
        >
          <video
            ref={videoRef}
            src={imeta.url}
            poster={imeta.thumbnail}
            className="w-full max-h-[70vh] object-contain"
            loop
            playsInline
            preload="none"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
          />
          {/* Play overlay */}
          {!isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="size-14 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                <Play className="size-7 text-white ml-1" fill="white" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hashtags */}
      {hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-4 pt-2">
          {hashtags.slice(0, 5).map((tag) => (
            <Link
              key={tag}
              to={`/t/${encodeURIComponent(tag)}`}
              className="text-xs text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}

      {/* Spacer */}
      <div className="h-3" />
    </article>
  );
}
