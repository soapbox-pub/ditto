import { useMemo } from 'react';
import { List, Users } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { useAuthors } from '@/hooks/useAuthors';
import { genUserName } from '@/lib/genUserName';
import type { NostrEvent } from '@nostrify/nostrify';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

export function ListCard({ event }: { event: NostrEvent }) {
  const title = getTag(event.tags, 'title') || getTag(event.tags, 'name');
  const description = getTag(event.tags, 'description') || getTag(event.tags, 'summary');
  const pubkeys = useMemo(
    () => event.tags.filter(([n]) => n === 'p').map(([, pk]) => pk),
    [event.tags],
  );

  const previewPubkeys = useMemo(() => pubkeys.slice(0, 8), [pubkeys]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  return (
    <div className="mt-2">
      {title && (
        <div className="flex items-center gap-2 mb-2">
          <List className="size-4 text-primary shrink-0" />
          <span className="text-[15px] font-semibold leading-snug">{title}</span>
          <Badge variant="secondary" className="text-[10px] font-medium">List</Badge>
        </div>
      )}

      {description && (
        <p className="text-[15px] leading-relaxed text-foreground/90 line-clamp-3 mb-3">
          {description}
        </p>
      )}

      {pubkeys.length > 0 && (
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[11px] gap-1 font-medium shrink-0">
            <Users className="size-3" />
            {pubkeys.length}
          </Badge>
          <div className="flex -space-x-2">
            {previewPubkeys.map((pk) => {
              const member = membersMap?.get(pk);
              const name = member?.metadata?.name || genUserName(pk);
              return (
                <Avatar key={pk} className="size-7">
                  <AvatarImage src={member?.metadata?.picture} alt={name} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                    {name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              );
            })}
          </div>
          {pubkeys.length > previewPubkeys.length && (
            <span className="text-xs text-muted-foreground">
              +{pubkeys.length - previewPubkeys.length} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
