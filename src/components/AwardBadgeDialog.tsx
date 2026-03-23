import { useState, useCallback, useMemo } from 'react';
import { Search, X, Award, Loader2, Check } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSearchProfiles, type SearchProfile } from '@/hooks/useSearchProfiles';
import { useAwardBadge } from '@/hooks/useAwardBadge';
import { useToast } from '@/hooks/useToast';
import { genUserName } from '@/lib/genUserName';

interface AwardBadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The badge's `a` tag value (e.g. `30009:<pubkey>:<identifier>`). */
  badgeATag: string;
  /** Badge name for display. */
  badgeName: string;
}

export function AwardBadgeDialog({ open, onOpenChange, badgeATag, badgeName }: AwardBadgeDialogProps) {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<SearchProfile[]>([]);

  const { data: results, isLoading: isSearching } = useSearchProfiles(query);
  const { mutateAsync: awardBadge, isPending: isAwarding } = useAwardBadge();

  const selectedPubkeys = useMemo(() => new Set(selected.map((p) => p.pubkey)), [selected]);

  // Filter out already-selected profiles from search results
  const filteredResults = useMemo(
    () => (results ?? []).filter((p) => !selectedPubkeys.has(p.pubkey)),
    [results, selectedPubkeys],
  );

  const handleSelect = useCallback((profile: SearchProfile) => {
    setSelected((prev) => {
      if (prev.some((p) => p.pubkey === profile.pubkey)) return prev;
      return [...prev, profile];
    });
    setQuery('');
  }, []);

  const handleRemove = useCallback((pubkey: string) => {
    setSelected((prev) => prev.filter((p) => p.pubkey !== pubkey));
  }, []);

  const handleAward = useCallback(async () => {
    if (selected.length === 0) return;
    try {
      await awardBadge({
        aTag: badgeATag,
        recipientPubkeys: selected.map((p) => p.pubkey),
      });
      toast({
        title: 'Badge awarded!',
        description: `"${badgeName}" awarded to ${selected.length} user${selected.length !== 1 ? 's' : ''}.`,
      });
      setSelected([]);
      setQuery('');
      onOpenChange(false);
    } catch {
      toast({ title: 'Failed to award badge', description: 'Please try again.', variant: 'destructive' });
    }
  }, [selected, awardBadge, badgeATag, badgeName, toast, onOpenChange]);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      setQuery('');
      setSelected([]);
    }
    onOpenChange(nextOpen);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Award className="size-5 text-primary" />
            Award Badge
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Search for users to award <span className="font-medium text-foreground">"{badgeName}"</span> to.
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or NIP-05..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9 pr-3"
              autoFocus
            />
          </div>
        </div>

        {/* Selected users as chips */}
        {selected.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex flex-wrap gap-1.5">
              {selected.map((profile) => {
                const name = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
                return (
                  <button
                    key={profile.pubkey}
                    type="button"
                    onClick={() => handleRemove(profile.pubkey)}
                    className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
                  >
                    <Avatar className="size-5">
                      <AvatarImage src={profile.metadata.picture} alt={name} />
                      <AvatarFallback className="bg-primary/20 text-[9px] text-primary">
                        {name[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="max-w-[100px] truncate">{name}</span>
                    <X className="size-3 opacity-60" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search results */}
        <ScrollArea className="border-t border-border" style={{ height: 280 }}>
          {isSearching && query.trim().length > 0 ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : filteredResults.length > 0 ? (
            <div className="divide-y divide-border">
              {filteredResults.map((profile) => (
                <SearchResultItem
                  key={profile.pubkey}
                  profile={profile}
                  onSelect={handleSelect}
                />
              ))}
            </div>
          ) : query.trim().length > 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
              <Search className="size-8 mb-2 opacity-30" />
              No users found
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground text-sm">
              <Search className="size-8 mb-2 opacity-30" />
              Search to find users
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-secondary/5">
          <Button
            onClick={handleAward}
            disabled={selected.length === 0 || isAwarding}
            className="w-full gap-2"
          >
            {isAwarding ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Awarding...
              </>
            ) : (
              <>
                <Check className="size-4" />
                Award Badge{selected.length > 0 ? ` to ${selected.length} user${selected.length !== 1 ? 's' : ''}` : ''}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SearchResultItem({ profile, onSelect }: { profile: SearchProfile; onSelect: (p: SearchProfile) => void }) {
  const name = profile.metadata.display_name || profile.metadata.name || genUserName(profile.pubkey);
  const about = profile.metadata.about;

  return (
    <button
      type="button"
      onClick={() => onSelect(profile)}
      className="flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-secondary/30 transition-colors"
    >
      <Avatar className="size-10 shrink-0">
        <AvatarImage src={profile.metadata.picture} alt={name} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {name[0]?.toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <span className="font-semibold text-sm block truncate">{name}</span>
        {about && (
          <p className="text-xs text-muted-foreground line-clamp-1">{about}</p>
        )}
      </div>
    </button>
  );
}
