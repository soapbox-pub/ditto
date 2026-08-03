import { useCallback, useState } from 'react';
import { Check, Loader2, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAddEmojiPack, useHasEmojiPack } from '@/hooks/useEmojiPacks';
import { useEmojiSource } from '@/hooks/useEmojiSource';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface EmojiSourceFooterProps {
  /** The custom emoji's image URL — the key its origin pack is resolved by. */
  url: string;
  /** The emoji's shortcode (no colons), for the preview thumbnail. */
  name?: string;
  /** Extra classes for the outer row. */
  className?: string;
}

/**
 * Attribution row for a custom-emoji reaction: which NIP-30 pack it came from,
 * plus a one-tap add so seeing an emoji you like is enough to get it.
 *
 * Renders nothing when the emoji's origin can't be resolved — a reaction tag
 * carries only `[emoji, code, url]`, so a pack we've never seen stays unnamed
 * rather than being guessed at.
 */
export function EmojiSourceFooter({ url, name, className }: EmojiSourceFooterProps) {
  const { user } = useCurrentUser();
  const source = useEmojiSource(url);
  const alreadyAdded = useHasEmojiPack(source?.coord);
  const { mutateAsync: addPack, isPending } = useAddEmojiPack();
  const { toast } = useToast();
  // Flip the button the moment the publish lands, rather than waiting for the
  // list re-read to settle.
  const [justAdded, setJustAdded] = useState(false);

  const onAdd = useCallback(async () => {
    if (!source) return;
    try {
      await addPack({ pubkey: source.pubkey, identifier: source.identifier });
      setJustAdded(true);
      toast({ title: 'Emoji pack added', description: source.name });
    } catch (e) {
      toast({
        title: "Couldn't add pack",
        description: e instanceof Error ? e.message : 'Publishing failed.',
        variant: 'destructive',
      });
    }
  }, [addPack, source, toast]);

  if (!source) return null;
  const isAdded = justAdded || alreadyAdded;

  return (
    <div className={cn('flex items-center gap-2.5 px-4 py-2.5', className)}>
      {name && (
        <CustomEmojiImg
          name={name}
          url={url}
          className="size-7 shrink-0 rounded object-contain"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">From</div>
        <div className="truncate text-sm font-medium">{source.name}</div>
      </div>
      {user && (
        isAdded ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5" /> Added
          </span>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            className="h-8 shrink-0 gap-1.5 text-xs"
            onClick={onAdd}
            disabled={isPending}
          >
            {isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
            Add
          </Button>
        )
      )}
    </div>
  );
}
