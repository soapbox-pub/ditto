/**
 * UserListsPage
 *
 * Settings sub-page for managing NIP-51 Follow Sets (kind 30000).
 */
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import {
  ArrowLeft, Plus, Trash2, Users, Pencil,
  Check, X,
} from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { IntroImage } from '@/components/IntroImage';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useUserLists } from '@/hooks/useUserLists';
import { useAuthor } from '@/hooks/useAuthor';
import { genUserName } from '@/lib/genUserName';
import { toast } from '@/hooks/useToast';
import type { UserList } from '@/hooks/useUserLists';


// ─── Mini Avatar ──────────────────────────────────────────────────────────────

function MiniAvatar({ pubkey }: { pubkey: string }) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name ?? genUserName(pubkey);
  return (
    <Avatar shape={avatarShape} className="size-7 border-2 border-background shrink-0">
      <AvatarImage src={metadata?.picture} alt={displayName} />
      <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
        {displayName[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

// ─── List Row ─────────────────────────────────────────────────────────────────

function ListRow({ list, onDelete }: { list: UserList; onDelete: (list: UserList) => void }) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const [editing, setEditing] = useState(false);
  const [renameValue, setRenameValue] = useState(list.title);
  const { renameList } = useUserLists();

  const handleRename = () => {
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

  const previewPubkeys = list.pubkeys.slice(0, 4);

  return (
    <>
      <div
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer group"
        onClick={() => {
          if (editing || !user) return;
          const addr = nip19.naddrEncode({ kind: 30000, pubkey: user.pubkey, identifier: list.id });
          navigate(`/${addr}`);
        }}
      >
        {/* Avatar stack */}
        <div className="flex -space-x-1.5 shrink-0 w-16 overflow-hidden">
          {previewPubkeys.length > 0 ? previewPubkeys.map((pk) => (
            <MiniAvatar key={pk} pubkey={pk} />
          )) : (
            <div className="size-7 rounded-full bg-muted border-2 border-background flex items-center justify-center">
              <Users className="size-3 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* Label / rename input */}
        <div className="flex-1 min-w-0" onClick={(e) => editing && e.stopPropagation()}>
          {editing ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRename();
                  if (e.key === 'Escape') { setEditing(false); setRenameValue(list.title); }
                }}
                className="h-7 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
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
            <div>
              <span className="text-sm font-medium truncate block">{list.title}</span>
              <span className="text-xs text-muted-foreground">
                {list.pubkeys.length} {list.pubkeys.length === 1 ? 'person' : 'people'}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons — visible on hover */}
        {!editing && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={(e) => e.stopPropagation()}>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-foreground"
              onClick={() => { setEditing(true); setRenameValue(list.title); }}
              title="Rename"
            >
              <Pencil className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(list)}
              title="Delete"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function UserListsPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { lists, isLoading, createList, deleteList } = useUserLists();

  useSeoMeta({
    title: `Lists | Settings | ${config.appName}`,
    description: 'Manage your lists on Nostr.',
  });

  const [newListName, setNewListName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<UserList | null>(null);

  if (!user) return <Navigate to="/settings" replace />;

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
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Lists</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Organize people into lists. Lists are stored on Nostr so they follow you across clients.
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Intro block */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-4">
          <IntroImage src="/lists-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Lists</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Group people into named lists. Use any list as the source for a custom feed, or filter searches by list members.
            </p>
          </div>
        </div>

        {/* Create new list */}
        <div className="flex gap-2 mb-4">
          <Input
            placeholder="New list name…"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
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

        {/* Your Lists */}
        <div>
          <div className="relative px-3 py-3.5">
            <h2 className="text-base font-semibold">
              Your Lists
              {!isLoading && lists.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  {lists.length}
                </span>
              )}
            </h2>
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
          </div>
          <div className="pt-2 pb-2">
            {isLoading ? (
              <div className="space-y-1 px-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex -space-x-1.5 w-10">
                      <Skeleton className="size-7 rounded-full" />
                      <Skeleton className="size-7 rounded-full" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3.5 w-28" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                ))}
              </div>
            ) : lists.length === 0 ? (
              <p className="px-3 py-4 text-sm text-muted-foreground">
                No lists yet. Create one above, or add users from the&nbsp;… menu on notes and profiles.
              </p>
            ) : (
              <div className="space-y-0.5 px-1">
                {lists.map((list) => (
                  <ListRow key={list.id} list={list} onDelete={setDeleteTarget} />
                ))}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground px-3 pt-4 leading-relaxed">
          Lists are stored on Nostr (NIP-51) and sync across clients.
        </p>
      </div>

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
