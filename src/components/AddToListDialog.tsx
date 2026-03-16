/**
 * AddToListDialog
 *
 * A dialog for adding a user (by pubkey) to one of the current user's
 * NIP-51 Follow Sets (kind 30000) or Follow Packs (kind 39089),
 * or creating a new Follow Set on the fly.
 */
import { useState } from 'react';
import { Plus, Loader2, List, Users, X, PartyPopper, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useUserLists } from '@/hooks/useUserLists';
import { useFollowPacks } from '@/hooks/useFollowPacks';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';
import type { FollowPack } from '@/hooks/useFollowPacks';

interface AddToListDialogProps {
  /** Hex pubkey of the user to add */
  pubkey: string;
  /** Display name for the user being added */
  displayName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}


export function AddToListDialog({ pubkey, displayName, open, onOpenChange }: AddToListDialogProps) {
  const { user } = useCurrentUser();
  const { lists, isLoading: listsLoading, addToList, createList, isInList } = useUserLists();
  const { data: followPacks = [], isLoading: packsLoading } = useFollowPacks();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const [newListName, setNewListName] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  // Optimistic tracking for packs added this session
  const [addedPackIds, setAddedPackIds] = useState<Set<string>>(new Set());

  const handleOpenChange = (o: boolean) => {
    if (!o) setAddedPackIds(new Set());
    onOpenChange(o);
  };

  const close = () => handleOpenChange(false);

  const isLoading = listsLoading || packsLoading;

  /** Add pubkey to a Follow Set (kind 30000). */
  const handleAddToList = async (listId: string) => {
    if (pendingId) return;
    setPendingId(listId);
    try {
      await addToList.mutateAsync({ listId, pubkey });
      toast({ title: 'Added to list' });
    } catch {
      toast({ title: 'Failed to add to list', variant: 'destructive' });
    } finally {
      setPendingId(null);
    }
  };

  /** Add pubkey to a Follow Pack (kind 39089). */
  const handleAddToPack = async (pack: FollowPack) => {
    if (pendingId) return;
    setPendingId(pack.id);
    try {
      const newTags = [...pack.event.tags, ['p', pubkey]];
      await publishEvent({
        kind: 39089,
        content: pack.event.content ?? '',
        tags: newTags,
      });
      setAddedPackIds((prev) => new Set(prev).add(pack.id));
      queryClient.invalidateQueries({ queryKey: ['own-follow-packs', user?.pubkey] });
      toast({ title: `Added to "${pack.title}"` });
    } catch {
      toast({ title: 'Failed to add to pack', variant: 'destructive' });
    } finally {
      setPendingId(null);
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newListName.trim() || creatingNew) return;
    setCreatingNew(true);
    try {
      const result = await createList.mutateAsync({
        title: newListName.trim(),
        pubkeys: [pubkey],
      });
      toast({ title: `Created "${result.title}" and added` });
      setNewListName('');
    } catch {
      toast({ title: 'Failed to create list', variant: 'destructive' });
    } finally {
      setCreatingNew(false);
    }
  };

  const hasAny = lists.length > 0 || followPacks.length > 0;

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm max-h-[80dvh] p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 shrink-0">
          <DialogHeader className="p-0 space-y-0">
            <DialogTitle className="text-base font-bold">
              {displayName ? `Add ${displayName} to list` : 'Add to list'}
            </DialogTitle>
          </DialogHeader>
          <Button variant="ghost" size="icon" className="rounded-full size-8 shrink-0" onClick={close}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="py-2 space-y-1">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2.5 flex-1">
                    <Skeleton className="size-4 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-7 w-14 rounded-md" />
                </div>
              ))}
            </div>
          ) : !hasAny ? (
            <div className="py-8 px-4 text-center text-sm text-muted-foreground">
              <List className="size-8 mx-auto mb-2 text-muted-foreground/40" />
              No lists or packs yet. Create one below.
            </div>
          ) : (
            <div className="py-1">
              {/* Follow Sets */}
              {lists.length > 0 && (
                <>
                  {followPacks.length > 0 && (
                    <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Lists
                    </p>
                  )}
                  {lists.map((list) => {
                    const inList = isInList(list.id, pubkey);
                    const isPending = pendingId === list.id;
                    return (
                      <ListRow
                        key={list.id}
                        icon={<List className="size-3.5 text-muted-foreground shrink-0" />}
                        label={list.title}
                        count={list.pubkeys.length}
                        inList={inList}
                        isPending={isPending}
                        disabled={!!pendingId}
                        onAdd={() => handleAddToList(list.id)}
                      />
                    );
                  })}
                </>
              )}

              {/* Follow Packs */}
              {followPacks.length > 0 && (
                <>
                  {lists.length > 0 && <Separator className="my-1" />}
                  <p className="px-4 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Follow Packs
                  </p>
                  {followPacks.map((pack) => {
                    const inPack = pack.pubkeys.includes(pubkey) || addedPackIds.has(pack.id);
                    const isPending = pendingId === pack.id;
                    return (
                      <ListRow
                        key={pack.id}
                        icon={<PartyPopper className="size-3.5 text-muted-foreground shrink-0" />}
                        label={pack.title}
                        count={pack.pubkeys.length}
                        inList={inPack}
                        isPending={isPending}
                        disabled={!!pendingId}
                        onAdd={() => handleAddToPack(pack)}
                      />
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Create new list */}
        <div className="p-3 space-y-2 shrink-0">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide px-1">
            New list
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="List name…"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAndAdd(); }}
              className="flex-1 h-8 text-sm"
              disabled={creatingNew}
            />
            <Button
              size="sm"
              onClick={handleCreateAndAdd}
              disabled={!newListName.trim() || creatingNew}
              className="h-8 gap-1"
            >
              {creatingNew ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ListRow ──────────────────────────────────────────────────────────────────

interface ListRowProps {
  icon: React.ReactNode;
  label: string;
  count: number;
  inList: boolean;
  isPending: boolean;
  disabled: boolean;
  onAdd: () => void;
}

function ListRow({ icon, label, count, inList, isPending, disabled, onAdd }: ListRowProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/40 transition-colors">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {icon}
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{label}</div>
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Users className="size-3 shrink-0" />
            {count} {count === 1 ? 'person' : 'people'}
          </div>
        </div>
      </div>

      <Button
        size="sm"
        variant={inList ? 'secondary' : 'default'}
        className="h-7 px-2.5 text-xs shrink-0 gap-1.5"
        disabled={disabled || inList}
        onClick={onAdd}
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : inList ? (
          <><Check className="size-3" /> Added</>
        ) : (
          <><Plus className="size-3" /> Add</>
        )}
      </Button>
    </div>
  );
}
