import { lazy, Suspense, useMemo, useState } from 'react';
import { Loader2, Pencil, Smile, Trash2 } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  emojiPackEntries,
  emojiPackName,
  emojiPackPicture,
  useMyEmojiPacks,
  useMyPublishedPacks,
  useRemoveEmojiPack,
  type MyEmojiPack,
} from '@/hooks/useEmojiPacks';
import { useToast } from '@/hooks/useToast';

const EmojiPackDialog = lazy(() =>
  import('@/components/EmojiPackDialog').then((m) => ({ default: m.EmojiPackDialog })),
);

/** How many emojis to preview per pack before "+N". */
const PREVIEW_LIMIT = 10;

/** The pubkey that authored a pack, read from its `30030:pubkey:dtag` coord. */
function packAuthor(coord: string): string {
  return coord.split(':')[1] ?? '';
}

/**
 * Manage the current user's emoji packs, split into the packs they've
 * *published* (authored kind-30030 events, editable) and the packs they've
 * *added* from others (kind-10030 `a` refs, removable). Shares the
 * `my-published-packs` / `my-emoji-packs` caches so it stays in sync as packs
 * are created, added, and removed.
 */
export function EmojiPackManager() {
  const { user } = useCurrentUser();
  const published = useMyPublishedPacks();
  const added = useMyEmojiPacks();
  const [editEvent, setEditEvent] = useState<NostrEvent | null>(null);

  // Packs on your list that you didn't author — the ones you've collected.
  // Your own packs appear under Published even when also on your list, so they
  // aren't listed twice.
  const addedFromOthers = useMemo(
    () => (added.data ?? []).filter((p) => packAuthor(p.coord) !== user?.pubkey),
    [added.data, user?.pubkey],
  );

  if (!user) {
    return (
      <Card className="border-dashed mx-4 my-6">
        <CardContent className="py-12 px-8 text-center">
          <p className="text-muted-foreground max-w-sm mx-auto">
            Log in to create emoji packs and manage your collection.
          </p>
        </CardContent>
      </Card>
    );
  }

  const loading =
    (published.isLoading && !published.data) || (added.isLoading && !added.data);
  if (loading) {
    return (
      <div className="px-4 py-4 space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-10 rounded-lg shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const publishedPacks = published.data ?? [];
  const isEmpty = publishedPacks.length === 0 && addedFromOthers.length === 0;

  if (isEmpty) {
    return (
      <Card className="border-dashed mx-4 my-6">
        <CardContent className="py-12 px-8 text-center space-y-1">
          <Smile className="size-8 mx-auto text-muted-foreground/60" />
          <p className="text-muted-foreground max-w-sm mx-auto">
            No emoji packs yet. Browse the Global tab and tap Add on a pack, or create your own with
            the + button.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {publishedPacks.length > 0 && (
        <section>
          <SectionHeader title="Published" count={publishedPacks.length} />
          <div className="divide-y divide-border">
            {publishedPacks.map((pack) => (
              <PackRow key={pack.coord} pack={pack} mode="published" onEdit={setEditEvent} />
            ))}
          </div>
        </section>
      )}

      {addedFromOthers.length > 0 && (
        <section>
          <SectionHeader title="Added" count={addedFromOthers.length} />
          <div className="divide-y divide-border">
            {addedFromOthers.map((pack) => (
              <PackRow key={pack.coord} pack={pack} mode="added" />
            ))}
          </div>
        </section>
      )}

      {editEvent && (
        <Suspense fallback={null}>
          <EmojiPackDialog
            open={!!editEvent}
            onOpenChange={(open) => !open && setEditEvent(null)}
            editEvent={editEvent}
          />
        </Suspense>
      )}
    </>
  );
}

/** A small labelled group divider ("Published", "Added"). */
function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 pb-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      <span className="text-xs text-muted-foreground/70 tabular-nums">{count}</span>
    </div>
  );
}

interface PackRowProps {
  pack: MyEmojiPack;
  /** `published` shows an Edit action; `added` shows a Remove action. */
  mode: 'published' | 'added';
  /** Called with the pack event when the Edit action is used. */
  onEdit?: (event: NostrEvent) => void;
}

/** One pack row: icon + name + emoji preview, with a mode-specific action. */
function PackRow({ pack, mode, onEdit }: PackRowProps) {
  const { mutateAsync: removePack, isPending } = useRemoveEmojiPack();
  const { toast } = useToast();
  const [removed, setRemoved] = useState(false);

  // Fall back to the coordinate's d-tag when the pack event hasn't resolved.
  const name = pack.event ? emojiPackName(pack.event) : pack.coord.split(':')[2] || 'Emoji pack';
  const picture = pack.event ? emojiPackPicture(pack.event) : undefined;
  const entries = pack.event ? emojiPackEntries(pack.event) : [];
  const visible = entries.slice(0, PREVIEW_LIMIT);
  const extra = entries.length - visible.length;

  // Drop the row immediately on a successful remove; the query invalidation
  // that follows would remove it anyway, but this avoids a flash.
  if (removed) return null;

  const onRemove = async () => {
    try {
      await removePack({ coord: pack.coord });
      setRemoved(true);
      toast({ title: 'Emoji pack removed', description: name });
    } catch (e) {
      toast({
        title: "Couldn't remove pack",
        description: e instanceof Error ? e.message : 'Publishing failed.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      {picture ? (
        <img
          src={picture}
          alt=""
          className="size-10 shrink-0 rounded-lg object-cover border border-border"
        />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
          <Smile className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="text-sm font-semibold leading-tight truncate">{name}</div>
        {visible.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {visible.map((e) => (
              <CustomEmojiImg
                key={e.shortcode}
                name={e.shortcode}
                url={e.url}
                className="size-6 object-contain"
              />
            ))}
            {extra > 0 && <span className="text-xs text-muted-foreground">+{extra}</span>}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            {pack.event ? 'This pack has no emojis.' : 'Pack details couldn’t be loaded.'}
          </div>
        )}
      </div>

      {mode === 'published' ? (
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => pack.event && onEdit?.(pack.event)}
          disabled={!pack.event}
          aria-label={`Edit ${name}`}
        >
          <Pencil className="size-4" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          disabled={isPending}
          aria-label={`Remove ${name}`}
        >
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      )}
    </div>
  );
}
