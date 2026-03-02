import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Search, UserRoundCheck, UserPlus, Check, Loader2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { usePersonalLists } from '@/hooks/usePersonalLists';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';

interface AddMembersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dTag: string;
  currentMembers: string[];
}

export function AddMembersDialog({ open, onOpenChange, dTag, currentMembers }: AddMembersDialogProps) {
  const { toast } = useToast();
  const { addToList } = usePersonalLists();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [addingPubkeys, setAddingPubkeys] = useState<Set<string>>(new Set());
  const [addedPubkeys, setAddedPubkeys] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: profiles, isFetching, followedPubkeys } = useSearchProfiles(query);

  const memberSet = useMemo(() => new Set(currentMembers), [currentMembers]);

  // Filter out profiles already in the list (unless just added in this session)
  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    return profiles.filter((p) => !memberSet.has(p.pubkey) || addedPubkeys.has(p.pubkey));
  }, [profiles, memberSet, addedPubkeys]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(-1);
      setAddedPubkeys(new Set());
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(-1);
  }, [filteredProfiles.length]);

  const handleAdd = useCallback(async (profile: SearchProfile) => {
    if (addingPubkeys.has(profile.pubkey) || addedPubkeys.has(profile.pubkey)) return;
    if (memberSet.has(profile.pubkey)) {
      toast({ title: 'Already a member' });
      return;
    }

    setAddingPubkeys((prev) => new Set(prev).add(profile.pubkey));
    try {
      await addToList.mutateAsync({ dTag, pubkey: profile.pubkey });
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
  }, [dTag, addToList, addingPubkeys, addedPubkeys, memberSet, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onOpenChange(false);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < filteredProfiles.length) {
        const profile = filteredProfiles[selectedIndex];
        if (!addedPubkeys.has(profile.pubkey) && !memberSet.has(profile.pubkey)) {
          handleAdd(profile);
        }
      }
      return;
    }

    if (filteredProfiles.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev < filteredProfiles.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : filteredProfiles.length - 1));
        break;
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-search-item]');
      items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Members</DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-muted-foreground pointer-events-none" />
          {isFetching && (
            <Loader2 className="absolute right-3 size-4 text-muted-foreground animate-spin" />
          )}
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search people..."
            className="pl-10 pr-10"
            autoComplete="off"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[320px] overflow-y-auto -mx-1">
          {query.trim().length > 0 && filteredProfiles.length > 0 && filteredProfiles.map((profile, index) => {
            const isAdding = addingPubkeys.has(profile.pubkey);
            const isAdded = addedPubkeys.has(profile.pubkey) || memberSet.has(profile.pubkey);
            return (
              <MemberSearchItem
                key={profile.pubkey}
                profile={profile}
                isSelected={index === selectedIndex}
                isFollowed={followedPubkeys.has(profile.pubkey)}
                isAdding={isAdding}
                isAdded={isAdded}
                onClick={() => handleAdd(profile)}
              />
            );
          })}

          {query.trim().length > 0 && !isFetching && filteredProfiles.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No profiles found
            </div>
          )}

          {query.trim().length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Search for people to add to this list
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberSearchItem({
  profile,
  isSelected,
  isFollowed,
  isAdding,
  isAdded,
  onClick,
}: {
  profile: SearchProfile;
  isSelected: boolean;
  isFollowed: boolean;
  isAdding: boolean;
  isAdded: boolean;
  onClick: () => void;
}) {
  const { metadata, pubkey } = profile;
  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);
  const nip05 = metadata.nip05;
  const identifier = nip05 || nip19.npubEncode(pubkey);

  return (
    <button
      data-search-item
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors cursor-pointer rounded-lg mx-1',
        isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-secondary/60',
        isAdded && 'opacity-60',
      )}
      onClick={onClick}
      disabled={isAdding || isAdded}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="relative shrink-0">
        <Avatar className="size-10">
          <AvatarImage src={metadata.picture} alt={displayName} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {displayName[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
        {isFollowed && (
          <span className="absolute -bottom-0.5 -right-0.5 size-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-popover">
            <UserRoundCheck className="size-2.5 text-primary-foreground" strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm truncate block">{displayName}</span>
        <div className="text-xs text-muted-foreground truncate">
          {nip05 ? (
            <span>{identifier}</span>
          ) : (
            <span className="font-mono text-[11px]">{identifier}</span>
          )}
        </div>
      </div>

      <div className="shrink-0">
        {isAdding ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : isAdded ? (
          <Check className="size-4 text-primary" />
        ) : (
          <UserPlus className="size-4 text-muted-foreground" />
        )}
      </div>
    </button>
  );
}
