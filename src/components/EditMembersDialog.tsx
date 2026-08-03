/**
 * EditMembersDialog
 *
 * Owner dialog for managing the members of a follow set (kind 30000) or
 * follow pack (kind 39089). With an empty search box it lists the current
 * members with remove buttons; typing searches profiles via NIP-50 to add
 * new people. Search results that are already members can be removed in
 * place, so the whole membership is editable from one dialog.
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, Plus, UserPlus, Users, Check, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { useAuthors } from '@/hooks/useAuthors';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useUserLists } from '@/hooks/useUserLists';
import { useFollowPackActions } from '@/hooks/useFollowPacks';
import { toast } from '@/hooks/useToast';
import type { NostrMetadata } from '@nostrify/nostrify';

interface EditMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  /** The list's kind — 30000 (follow set, default) or 39089 (follow pack). */
  listKind?: number;
  listPubkeys: string[];
}

export function EditMembersDialog({ open, onOpenChange, listId, listKind = 30000, listPubkeys }: EditMembersDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pendingPubkeys, setPendingPubkeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading, isFetching } = useSearchProfiles(query);
  const { addToList, removeFromList } = useUserLists();
  const { addToPack, removeFromPack } = useFollowPackActions();
  const isPack = listKind === 39089;
  const noun = isPack ? 'pack' : 'list';

  // Metadata for the current members (shared cache with the detail page).
  const { data: membersMap } = useAuthors(listPubkeys);

  // Existing member set — the prop updates after each mutation because the
  // mutations sync the addr-event cache, so this always reflects relay state.
  const existingMembers = useMemo(() => new Set(listPubkeys), [listPubkeys]);

  const isSearching = !!query.trim();

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setPendingPubkeys(new Set());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [searchResults?.length]);

  /** Add or remove a member depending on current membership. */
  const handleToggle = useCallback(async (pubkey: string, metadata: NostrMetadata | undefined) => {
    if (pendingPubkeys.has(pubkey)) return;
    const isMember = existingMembers.has(pubkey);
    const name = metadata?.name || metadata?.display_name || 'Anonymous';
    setPendingPubkeys((prev) => new Set(prev).add(pubkey));
    try {
      if (isMember) {
        if (isPack) {
          await removeFromPack.mutateAsync({ packId: listId, pubkey });
        } else {
          await removeFromList.mutateAsync({ listId, pubkey });
        }
        toast({ title: `Removed ${name} from ${noun}` });
      } else {
        if (isPack) {
          await addToPack.mutateAsync({ packId: listId, pubkey });
        } else {
          await addToList.mutateAsync({ listId, pubkey });
        }
        toast({ title: `Added ${name} to ${noun}` });
      }
    } catch {
      toast({
        title: isMember ? 'Failed to remove member' : 'Failed to add member',
        variant: 'destructive',
      });
    } finally {
      setPendingPubkeys((prev) => {
        const next = new Set(prev);
        next.delete(pubkey);
        return next;
      });
    }
  }, [pendingPubkeys, existingMembers, isPack, noun, listId, addToList, removeFromList, addToPack, removeFromPack]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isSearching || !searchResults) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, searchResults.length - 1));
      scrollSelectedIntoView(selectedIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
      scrollSelectedIntoView(selectedIdx - 1);
    } else if (e.key === 'Enter' && searchResults[selectedIdx]) {
      e.preventDefault();
      const profile = searchResults[selectedIdx];
      handleToggle(profile.pubkey, profile.metadata);
    }
  };

  const scrollSelectedIntoView = (idx: number) => {
    const container = listRef.current;
    if (!container) return;
    const item = container.children[idx] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[70dvh] p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden flex flex-col">
        <div className="px-4 py-3 border-b border-border shrink-0">
          <DialogHeader className="p-0 space-y-0 mb-3">
            <DialogTitle className="text-base font-bold">Edit Members</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search to add people…"
              className="pl-9 pr-8"
            />
            {isFetching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
            )}
          </div>
        </div>

        <div ref={listRef} className="overflow-y-auto flex-1">
          {!isSearching ? (
            // ── Current members ────────────────────────────────────────────
            listPubkeys.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm px-6">
                <UserPlus className="size-8 mx-auto mb-2 opacity-50" />
                No members yet. Search above to add people.
              </div>
            ) : (
              <>
                <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  Members ({listPubkeys.length})
                </p>
                {listPubkeys.map((pk) => (
                  <MemberRow
                    key={pk}
                    pubkey={pk}
                    metadata={membersMap?.get(pk)?.metadata}
                    isMember
                    isPending={pendingPubkeys.has(pk)}
                    onToggle={handleToggle}
                  />
                ))}
              </>
            )
          ) : isLoading && !searchResults ? (
            <div className="py-12 text-center">
              <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : !searchResults || searchResults.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No profiles found.
            </div>
          ) : (
            // ── Search results — add new people, remove existing ones ──────
            searchResults.map((profile, idx) => (
              <MemberRow
                key={profile.pubkey}
                pubkey={profile.pubkey}
                metadata={profile.metadata}
                isMember={existingMembers.has(profile.pubkey)}
                isPending={pendingPubkeys.has(profile.pubkey)}
                isSelected={idx === selectedIdx}
                onMouseEnter={() => setSelectedIdx(idx)}
                onToggle={handleToggle}
              />
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── MemberRow ────────────────────────────────────────────────────────────────

interface MemberRowProps {
  pubkey: string;
  metadata?: NostrMetadata;
  isMember: boolean;
  isPending: boolean;
  isSelected?: boolean;
  onMouseEnter?: () => void;
  onToggle: (pubkey: string, metadata: NostrMetadata | undefined) => void;
}

function MemberRow({ pubkey, metadata, isMember, isPending, isSelected, onMouseEnter, onToggle }: MemberRowProps) {
  const name = metadata?.name || metadata?.display_name || 'Anonymous';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
        isMember ? '' : 'cursor-pointer'
      } ${isSelected ? 'bg-secondary/60' : 'hover:bg-secondary/30'}`}
      // Row click only adds — removing requires the explicit button so an
      // accidental tap on a member row can't kick someone out.
      onClick={() => { if (!isMember) onToggle(pubkey, metadata); }}
      onMouseEnter={onMouseEnter}
    >
      <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
        <AvatarImage src={metadata?.picture} alt={name} />
        <AvatarFallback className="bg-primary/20 text-primary text-xs">
          {name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate flex items-center gap-1.5">
          <span className="truncate">{name}</span>
          {isMember && (
            <Check className="size-3.5 text-green-600 dark:text-green-400 shrink-0" aria-label="Already a member" />
          )}
        </div>
        {metadata?.nip05 && (
          <div className="text-xs text-muted-foreground truncate">{metadata.nip05}</div>
        )}
      </div>
      <Button
        size="sm"
        variant={isMember ? 'outline' : 'default'}
        className={`h-7 px-2.5 text-xs shrink-0 gap-1 ${
          isMember ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : ''
        }`}
        disabled={isPending}
        onClick={(e) => { e.stopPropagation(); onToggle(pubkey, metadata); }}
      >
        {isPending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : isMember ? (
          <><X className="size-3" /> Remove</>
        ) : (
          <><Plus className="size-3" /> Add</>
        )}
      </Button>
    </div>
  );
}
