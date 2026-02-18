import { useMemo } from 'react';
import { Users, PartyPopper } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuthors } from '@/hooks/useAuthors';
import { genUserName } from '@/lib/genUserName';
import type { NostrEvent } from '@nostrify/nostrify';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

export function FollowPackContent({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title') || getTag(event.tags, 'name');
  const description = getTag(event.tags, 'description') || getTag(event.tags, 'summary');
  const image = getTag(event.tags, 'image');
  const pubkeys = useMemo(
    () => event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk),
    [event.tags],
  );

  const isStarterPack = event.kind === 39089;

  // Only fetch first few avatars for the preview
  const previewPubkeys = useMemo(() => pubkeys.slice(0, 8), [pubkeys]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  return (
    <div className="mt-2">
      {/* Title */}
      {title && (
        <div className="flex items-center gap-2 mb-2">
          <PartyPopper className="size-4 text-primary shrink-0" />
          <span className="text-[15px] font-semibold leading-snug">{title}</span>
        </div>
      )}

      {/* Badge + count */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
          {isStarterPack ? 'Starter Pack' : 'Follow Set'}
        </Badge>
        <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
          <Users className="size-3" />
          {pubkeys.length} member{pubkeys.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[15px] leading-relaxed text-foreground/90 line-clamp-3 mb-3">
          {description}
        </p>
      )}

      {/* Cover image */}
      {image && (
        <div className="rounded-2xl overflow-hidden mb-3">
          <img
            src={image}
            alt={title ?? 'Follow pack'}
            className="w-full max-h-[200px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Member avatar stack */}
      {pubkeys.length > 0 && (
        <div className="flex items-center">
          <div className="flex -space-x-2">
            {previewPubkeys.map((pk) => {
              const member = membersMap?.get(pk);
              const name = member?.metadata?.name || genUserName(pk);
              return (
                <Avatar key={pk} className="size-7 ring-2 ring-background">
                  <AvatarImage src={member?.metadata?.picture} alt={name} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                    {name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              );
            })}
          </div>
          {pubkeys.length > previewPubkeys.length && (
            <span className="text-xs text-muted-foreground ml-2">
              +{pubkeys.length - previewPubkeys.length} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
