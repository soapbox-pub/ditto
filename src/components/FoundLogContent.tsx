import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChestIcon } from '@/components/icons/ChestIcon';
import { useAddrEvent, type AddrCoords } from '@/hooks/useEvent';
import type { NostrEvent } from '@nostrify/nostrify';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getAllTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Parse the `a` tag from a found log into addressable event coordinates. */
function parseGeocacheAddr(tags: string[][]): AddrCoords | undefined {
  const aTag = getTag(tags, 'a');
  if (!aTag) return undefined;
  const parts = aTag.split(':');
  if (parts.length < 3) return undefined;
  const [kindStr, pubkey, ...rest] = parts;
  const kind = Number(kindStr);
  if (!kind || !pubkey) return undefined;
  return { kind, pubkey, identifier: rest.join(':') };
}

/** Renders the content of a found log event (kind 7516). */
export function FoundLogContent({ event }: { event: NostrEvent }) {
  const text = event.content;
  const images = getAllTags(event.tags, 'image').filter((url) => url.trim() !== '');
  const hasVerification = !!getTag(event.tags, 'verification');

  const geocacheAddr = useMemo(() => parseGeocacheAddr(event.tags), [event.tags]);
  const { data: geocacheEvent, isLoading: geocacheLoading } = useAddrEvent(geocacheAddr);

  const geocacheName = geocacheEvent?.tags.find(([n]) => n === 'name')?.[1];

  // Build naddr link for the treasure
  const geocacheLink = useMemo(() => {
    if (!geocacheAddr) return undefined;
    return `/${nip19.naddrEncode({ kind: geocacheAddr.kind, pubkey: geocacheAddr.pubkey, identifier: geocacheAddr.identifier })}`;
  }, [geocacheAddr]);

  return (
    <div className="mt-2">
      {/* Treasure name link + verified badge */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {geocacheLoading ? (
          <Skeleton className="h-5 w-32" />
        ) : geocacheName && geocacheLink ? (
          <Link
            to={geocacheLink}
            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            <ChestIcon className="size-3.5" />
            {geocacheName}
          </Link>
        ) : geocacheAddr ? (
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
            {geocacheAddr.identifier}
          </Badge>
        ) : null}
        {hasVerification && (
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium text-green-600 dark:text-green-400">
            <ShieldCheck className="size-3" />
            Verified
          </Badge>
        )}
      </div>

      {/* Log text */}
      {text && (
        <p className="text-[15px] leading-relaxed text-foreground/90 line-clamp-4">
          {text}
        </p>
      )}

      {/* Image */}
      {images.length > 0 && (
        <div className="mt-3 rounded-2xl overflow-hidden">
          <img
            src={images[0]}
            alt="Found log"
            className="w-full max-h-[300px] object-cover"
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}
