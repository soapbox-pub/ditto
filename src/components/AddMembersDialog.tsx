/**
 * AddMembersDialog
 *
 * Search-based dialog for adding profiles to a specific list.
 * Uses NIP-50 profile search and allows keyboard navigation.
 */
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Search, Loader2, Plus, UserPlus, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { Button } from '@/components/ui/button';
import { useSearchProfiles } from '@/hooks/useSearchProfiles';
import { useUserLists } from '@/hooks/useUserLists';
import { toast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import type { SearchProfile } from '@/hooks/useSearchProfiles';

interface AddMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listId: string;
  listPubkeys: string[];
}

export function AddMembersDialog({ open, onOpenChange, listId, listPubkeys }: AddMembersDialogProps) {
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [addingPubkeys, setAddingPubkeys] = useState<Set<string>>(new Set());
  const [addedPubkeys, setAddedPubkeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: searchResults, isLoading, isFetching } = useSearchProfiles(query);
  const { addToList } = useUserLists();

  // Existing member set for filtering
  const existingMembers = useMemo(() => new Set(listPubkeys), [listPubkeys]);

  // Filter out profiles already in the list
  const filteredResults = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.filter((p) => !existingMembers.has(p.pubkey));
  }, [searchResults, existingMembers]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setAddingPubkeys(new Set());
      setAddedPubkeys(new Set());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset selection when results change
  useEffect(() => {
    setSelectedIdx(0);
  }, [filteredResults.length]);

  const handleAdd = useCallback(async (profile: SearchProfile) => {
    if (addingPubkeys.has(profile.pubkey) || addedPubkeys.has(profile.pubkey)) return;
    setAddingPubkeys((prev) => new Set(prev).add(profile.pubkey));
    try {
      await addToList.mutateAsync({ listId, pubkey: profile.pubkey });
      setAddedPubkeys((prev) => new Set(prev).add(profile.pubkey));
      const name = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
      toast({ title: `Added ${name} to list` });
    } catch {
      toast({ title: 'Failed to add member', variant: 'destructive' });
    } finally {
      setAddingPubkeys((prev) => {
        const next = new Set(prev);
        next.delete(profile.pubkey);
        return next;
      });
    }
  }, [addToList, listId, addingPubkeys, addedPubkeys]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, filteredResults.length - 1));
      scrollSelectedIntoView(selectedIdx + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
      scrollSelectedIntoView(selectedIdx - 1);
    } else if (e.key === 'Enter' && filteredResults[selectedIdx]) {
      e.preventDefault();
      handleAdd(filteredResults[selectedIdx]);
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
            <DialogTitle className="text-base font-bold">Add Members</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search by name or NIP-05…"
              className="pl-9 pr-8"
            />
            {isFetching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground animate-spin" />
            )}
          </div>
        </div>

        <div ref={listRef} className="overflow-y-auto flex-1">
          {!query.trim() ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              <UserPlus className="size-8 mx-auto mb-2 opacity-50" />
              Search for people to add to this list.
            </div>
          ) : isLoading && !searchResults ? (
            <div className="py-12 text-center">
              <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {searchResults && searchResults.length > 0
                ? 'All matching users are already in this list.'
                : 'No profiles found.'}
            </div>
          ) : (
            filteredResults.map((profile, idx) => {
              const name = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
              const isAdding = addingPubkeys.has(profile.pubkey);
              const isAdded = addedPubkeys.has(profile.pubkey);
              const isSelected = idx === selectedIdx;

              return (
                <div
                  key={profile.pubkey}
                  className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                    isSelected ? 'bg-secondary/60' : 'hover:bg-secondary/30'
                  }`}
                  onClick={() => handleAdd(profile)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                >
                  <Avatar shape={getAvatarShape(profile.metadata as Record<string, unknown>)} className="size-9 shrink-0">
                    <AvatarImage src={profile.metadata.picture} alt={name} />
                    <AvatarFallback className="bg-primary/20 text-primary text-xs">
                      {name[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{name}</div>
                    {profile.metadata.nip05 && (
                      <div className="text-xs text-muted-foreground truncate">{profile.metadata.nip05}</div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant={isAdded ? 'secondary' : 'outline'}
                    className="h-7 px-2.5 text-xs shrink-0 gap-1"
                    disabled={isAdding || isAdded}
                    onClick={(e) => { e.stopPropagation(); handleAdd(profile); }}
                  >
                    {isAdding ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : isAdded ? (
                      <><Check className="size-3" /> Added</>
                    ) : (
                      <><Plus className="size-3" /> Add</>
                    )}
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
