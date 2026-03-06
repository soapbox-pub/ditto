/**
 * UserListsPage
 *
 * Displays and manages the user's NIP-51 Follow Sets (kind 30000).
 * Allows creating new lists, viewing list members, and deleting lists.
 */
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import {
  ArrowLeft, List, Plus, Trash2, Users, Pencil,
  Check, X, MoreHorizontal, ChevronRight, Loader2,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LoginArea } from '@/components/auth/LoginArea';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserLists } from '@/hooks/useUserLists';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { toast } from '@/hooks/useToast';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';
import type { UserList } from '@/hooks/useUserLists';

// ─── Member Row ───────────────────────────────────────────────────────────────

function MemberRow({ pubkey, onRemove, isRemoving = false, disabled = false }: {
  pubkey: string;
  onRemove?: () => void;
  isRemoving?: boolean;
  disabled?: boolean;
}) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  const npub = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);

  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors group">
      <Link to={`/${npub}`} className="flex items-center gap-3 flex-1 min-w-0">
        {author.isLoading ? (
          <>
            <Skeleton className="size-9 rounded-full shrink-0" />
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </>
        ) : (
          <>
            <Avatar className="size-9 shrink-0">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-xs">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{displayName}</div>
              {metadata?.nip05 && (
                <div className="text-xs text-muted-foreground truncate">{metadata.nip05}</div>
              )}
            </div>
          </>
        )}
      </Link>
      {onRemove && (
        <button
          onClick={onRemove}
          disabled={disabled}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 disabled:opacity-40 disabled:pointer-events-none transition-all"
          aria-label="Remove from list"
        >
          {isRemoving
            ? <Loader2 className="size-4 animate-spin" />
            : <X className="size-4" />}
        </button>
      )}
    </div>
  );
}

// ─── List Detail Dialog ───────────────────────────────────────────────────────

interface ListDetailDialogProps {
  list: UserList;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function ListDetailDialog({ list, open, onOpenChange }: ListDetailDialogProps) {
  const { removeFromList } = useUserLists();
  const [removingPubkey, setRemovingPubkey] = useState<string | null>(null);

  const handleRemove = (pubkey: string) => {
    if (removingPubkey) return;
    setRemovingPubkey(pubkey);
    removeFromList.mutate(
      { listId: list.id, pubkey },
      {
        onSuccess: () => toast({ title: 'Removed from list' }),
        onError: () => toast({ title: 'Failed to remove', variant: 'destructive' }),
        onSettled: () => setRemovingPubkey(null),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80dvh] p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <DialogHeader className="p-0 space-y-0">
            <DialogTitle className="text-base font-bold">{list.title}</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{list.pubkeys.length} members</span>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full size-8 ml-2"
              onClick={() => onOpenChange(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {list.pubkeys.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No members yet. Add users from their profiles or notes.
            </div>
          ) : (
            list.pubkeys.map((pk) => (
              <MemberRow
                key={pk}
                pubkey={pk}
                onRemove={() => handleRemove(pk)}
                isRemoving={removingPubkey === pk}
                disabled={!!removingPubkey}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── List Card ────────────────────────────────────────────────────────────────

interface ListCardProps {
  list: UserList;
  onDelete: (list: UserList) => void;
}

function ListCard({ list, onDelete }: ListCardProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [renameValue, setRenameValue] = useState(list.title);
  const { renameList } = useUserLists();

  const handleRename = async () => {
    if (!renameValue.trim() || renameValue.trim() === list.title) {
      setEditing(false);
      setRenameValue(list.title);
      return;
    }
    renameList.mutate(
      { listId: list.id, title: renameValue },
      {
        onSuccess: () => { toast({ title: 'List renamed' }); setEditing(false); },
        onError: () => { toast({ title: 'Failed to rename', variant: 'destructive' }); setEditing(false); },
      },
    );
  };

  // First 3 avatars for preview
  const previewPubkeys = list.pubkeys.slice(0, 3);

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors">
        {/* Avatar stack */}
        <div className="flex -space-x-2 shrink-0 w-12">
          {previewPubkeys.length > 0 ? previewPubkeys.map((pk) => (
            <MiniAvatar key={pk} pubkey={pk} />
          )) : (
            <div className="size-8 rounded-full bg-secondary border-2 border-background flex items-center justify-center">
              <Users className="size-3.5 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Label */}
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditing(false); setRenameValue(list.title); } }}
                className="h-7 text-sm"
                autoFocus
              />
              <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={handleRename}>
                <Check className="size-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => { setEditing(false); setRenameValue(list.title); }}>
                <X className="size-3.5" />
              </Button>
            </div>
          ) : (
            <button
              className="text-sm font-semibold text-left w-full truncate hover:text-primary transition-colors"
              onClick={() => setDetailOpen(true)}
            >
              {list.title}
            </button>
          )}
          <div className="text-xs text-muted-foreground mt-0.5">
            {list.pubkeys.length} {list.pubkeys.length === 1 ? 'person' : 'people'}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={() => setDetailOpen(true)}
            title="View list"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={() => { setEditing(true); setRenameValue(list.title); }}
            title="Rename list"
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(list)}
            title="Delete list"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <ListDetailDialog list={list} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  );
}

function MiniAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = metadata?.name ?? genUserName(pubkey);
  return (
    <Avatar className="size-8 border-2 border-background shrink-0">
      <AvatarImage src={metadata?.picture} alt={displayName} />
      <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
        {displayName[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function UserListsPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { lists, isLoading, createList, deleteList } = useUserLists();

  useSeoMeta({
    title: `Lists | ${config.appName}`,
    description: 'Manage your user lists on Nostr.',
  });

  const [newListName, setNewListName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserList | null>(null);

  const handleCreate = () => {
    if (!newListName.trim() || createList.isPending) return;
    createList.mutate(
      { title: newListName.trim() },
      {
        onSuccess: () => {
          toast({ title: `List "${newListName.trim()}" created` });
          setNewListName('');
        },
        onError: () => {
          toast({ title: 'Failed to create list', variant: 'destructive' });
        },
      },
    );
  };

  const handleDeleteConfirm = () => {
    if (!deleteTarget) return;
    deleteList.mutate(
      { listId: deleteTarget.id },
      {
        onSuccess: () => {
          toast({ title: `List "${deleteTarget.title}" deleted` });
          setDeleteTarget(null);
        },
        onError: () => {
          toast({ title: 'Failed to delete list', variant: 'destructive' });
          setDeleteTarget(null);
        },
      },
    );
  };

  return (
    <main>
      {/* Sticky header */}
      <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-3 px-4 py-3 bg-background/80 backdrop-blur-md z-10')}>
        <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2">
          <List className="size-5" />
          <h1 className="text-xl font-bold">Lists</h1>
        </div>
      </div>

      {!user ? (
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <List className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-bold">Organize people into lists</h2>
            <p className="text-muted-foreground text-sm">
              Log in to create and manage follow sets. Use them to build custom feeds from specific groups of people.
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      ) : (
        <>
          {/* Create new list */}
          <div className="px-4 py-3 border-b border-border">
            <div className="flex gap-2">
              <Input
                placeholder="New list name…"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                className="flex-1"
                disabled={createList.isPending}
              />
              <Button
                onClick={handleCreate}
                disabled={!newListName.trim() || createList.isPending}
                className="shrink-0 gap-1.5"
              >
                <Plus className="size-4" />
                Create
              </Button>
            </div>
          </div>

          {/* List of user lists */}
          {isLoading ? (
            <div>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex -space-x-2 w-12">
                    <Skeleton className="size-8 rounded-full" />
                    <Skeleton className="size-8 rounded-full" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : lists.length === 0 ? (
            <div className="py-16 px-8 text-center">
              <div className="p-3 rounded-full bg-secondary inline-flex mb-4">
                <MoreHorizontal className="size-6 text-muted-foreground" />
              </div>
              <h3 className="font-semibold text-sm">No lists yet</h3>
              <p className="text-muted-foreground text-sm mt-1">
                Create a list above, or add users from the ... menu on notes and profiles.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {lists.map((list) => (
                <ListCard key={list.id} list={list} onDelete={setDeleteTarget} />
              ))}
            </div>
          )}

          <Separator className="my-6" />

          <div className="px-4 pb-6">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Lists are Follow Sets (NIP-51) stored on Nostr. You can use any list as the source of people for a custom home feed.
            </p>
          </div>
        </>
      )}

      {/* Delete confirm dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete list?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete "{deleteTarget?.title}" and its {deleteTarget?.pubkeys.length ?? 0} members. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
