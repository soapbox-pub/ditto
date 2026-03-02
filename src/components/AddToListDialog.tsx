import { useState, useMemo } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/useToast';
import { usePersonalLists } from '@/hooks/usePersonalLists';

interface AddToListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pubkey: string;
  displayName: string;
}

export function AddToListDialog({ open, onOpenChange, pubkey, displayName }: AddToListDialogProps) {
  const { toast } = useToast();
  const { lists, addToList, removeFromList, createList } = usePersonalLists();
  const [newListTitle, setNewListTitle] = useState('');
  const [pendingDTags, setPendingDTags] = useState<Set<string>>(new Set());

  const membership = useMemo(
    () => new Set(lists.filter((l) => l.pubkeys.includes(pubkey)).map((l) => l.dTag)),
    [lists, pubkey],
  );

  const handleToggle = async (dTag: string, isMember: boolean) => {
    setPendingDTags((prev) => new Set(prev).add(dTag));
    try {
      if (isMember) {
        await removeFromList.mutateAsync({ dTag, pubkey });
        toast({ title: `Removed from list` });
      } else {
        await addToList.mutateAsync({ dTag, pubkey });
        toast({ title: `Added to list` });
      }
    } catch {
      toast({ title: 'Failed to update list', variant: 'destructive' });
    } finally {
      setPendingDTags((prev) => {
        const next = new Set(prev);
        next.delete(dTag);
        return next;
      });
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newListTitle.trim()) return;
    try {
      const event = await createList.mutateAsync({ title: newListTitle.trim() });
      const dTag = event.tags.find(([n]) => n === 'd')?.[1];
      if (dTag) {
        // The list was just created, add the pubkey in a separate step
        // Wait a tick for the query cache to update
        setTimeout(async () => {
          try {
            await addToList.mutateAsync({ dTag, pubkey });
            toast({ title: `Created list and added ${displayName}` });
          } catch {
            toast({ title: 'List created, but failed to add member', variant: 'destructive' });
          }
        }, 500);
      }
      setNewListTitle('');
    } catch {
      toast({ title: 'Failed to create list', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add {displayName} to list</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 max-h-[300px] overflow-y-auto">
          {lists.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              You don't have any lists yet.
            </p>
          )}
          {lists.map((list) => {
            const isMember = membership.has(list.dTag);
            const isPending = pendingDTags.has(list.dTag);
            return (
              <label
                key={list.dTag}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-secondary/40 cursor-pointer transition-colors"
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                ) : (
                  <Checkbox checked={isMember} onCheckedChange={() => handleToggle(list.dTag, isMember)} />
                )}
                <span className="text-sm font-medium flex-1 truncate">{list.title}</span>
                <span className="text-xs text-muted-foreground">{list.pubkeys.length}</span>
              </label>
            );
          })}
        </div>

        <div className="flex gap-2 pt-2 border-t border-border">
          <Input
            placeholder="New list name"
            value={newListTitle}
            onChange={(e) => setNewListTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreateAndAdd(); }}
            className="flex-1"
          />
          <Button size="icon" variant="outline" onClick={handleCreateAndAdd} disabled={!newListTitle.trim() || createList.isPending}>
            {createList.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
