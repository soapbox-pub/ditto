/**
 * FeedEditModal
 *
 * Modal for creating or editing a saved home feed tab.
 * Mirrors the structure of ProfileTabEditModal: direct state management,
 * MultiKindPicker for multi-select kinds, and a 3-way author scope toggle
 * (Anyone / Follows / People) with list/pack picker.
 */
import { useState, useMemo } from 'react';
import { Loader2, Check, Globe, Users, UserSearch } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  buildKindOptions,
  MultiKindPicker,
  AuthorChip,
  AuthorFilterDropdown,
  ScopeToggle,
  ListPackPicker,
  parseSelectedKinds,
} from '@/components/SavedFeedFiltersEditor';
import type { ScopeOption } from '@/components/SavedFeedFiltersEditor';
import { useUserLists, useMatchedListId } from '@/hooks/useUserLists';
import { useFollowPacks } from '@/hooks/useFollowPacks';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { TabVarDef } from '@/lib/profileTabsEvent';
import type { TabFilter } from '@/contexts/AppContext';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthorScope = 'anyone' | 'follows' | 'people';

interface FeedEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the modal is in "edit" mode. */
  initialLabel?: string;
  /** Initial filter values (for edit mode). */
  initialFilter?: TabFilter;
  /** Called when the user confirms. */
  onSave: (label: string, filter: TabFilter, vars: TabVarDef[]) => Promise<void>;
  isPending?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function filterToScope(filter: TabFilter): AuthorScope {
  const authors = Array.isArray(filter.authors) ? (filter.authors as string[]) : [];
  if (authors.includes('$follows')) return 'follows';
  if (authors.length > 0) return 'people';
  return 'anyone';
}

const FEED_SCOPE_OPTIONS: ScopeOption<AuthorScope>[] = [
  { value: 'anyone', label: 'Anyone', icon: Globe },
  { value: 'follows', label: 'Follows', icon: Users },
  { value: 'people', label: 'People', icon: UserSearch },
];

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function FeedEditModal({
  open,
  onOpenChange,
  initialLabel,
  initialFilter,
  onSave,
  isPending = false,
}: FeedEditModalProps) {
  const isEditing = !!initialLabel;
  const kindOptions = useMemo(() => buildKindOptions(), []);
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();
  const { user } = useCurrentUser();

  const initFrom = (filter: TabFilter | undefined) => ({
    label: initialLabel ?? '',
    scope: filterToScope(filter ?? {}),
    authors: Array.isArray(filter?.authors)
      ? (filter.authors as string[]).filter((a) => a !== '$follows')
      : [],
    kinds: parseSelectedKinds(filter ?? {}),
    search: typeof filter?.search === 'string' ? filter.search : '',
  });

  const [label, setLabel] = useState(() => initFrom(initialFilter).label);
  const [authorScope, setAuthorScope] = useState<AuthorScope>(() => initFrom(initialFilter).scope);
  const [authorPubkeys, setAuthorPubkeys] = useState<string[]>(() => initFrom(initialFilter).authors);
  const [selectedKinds, setSelectedKinds] = useState<string[]>(() => initFrom(initialFilter).kinds);
  const [search, setSearch] = useState(() => initFrom(initialFilter).search);

  // Reset all state when the modal opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      const init = initFrom(initialFilter);
      setLabel(init.label);
      setAuthorScope(init.scope);
      setAuthorPubkeys(init.authors);
      setSelectedKinds(init.kinds);
      setSearch(init.search);
    }
    onOpenChange(o);
  };

  const addAuthor = (pubkey: string) => {
    setAuthorPubkeys((prev) => prev.includes(pubkey) ? prev : [...prev, pubkey]);
  };

  const removeAuthor = (pubkey: string) => {
    setAuthorPubkeys((prev) => prev.filter((p) => p !== pubkey));
  };

  const listPickerValue = useMatchedListId(authorPubkeys);

  const handleSave = async () => {
    if (!label.trim() || isPending) return;

    const filter: TabFilter = {};
    const vars: TabVarDef[] = [];

    if (search.trim()) filter.search = search.trim();

    if (authorScope === 'follows') {
      filter.authors = ['$follows'];
      // Emit a var definition so useResolveTabFilter can expand $follows
      // via the current user's contact list (kind 3), matching profile tab behaviour.
      if (user) {
        vars.push({
          name: '$follows',
          tagName: 'p',
          pointer: `a:3:${user.pubkey}:`,
        });
      }
    } else if (authorScope === 'people' && authorPubkeys.length > 0) {
      filter.authors = authorPubkeys;
    }

    const kinds = selectedKinds.map(Number).filter((n) => !isNaN(n) && n > 0);
    if (kinds.length > 0) filter.kinds = kinds;

    await onSave(label.trim(), filter, vars);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit feed' : 'Add home feed'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Feed name */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Feed name
            </span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. Bitcoin, Photography..."
              autoFocus
            />
          </div>

          <Separator />

          {/* Search query */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Search query</span>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="e.g. bitcoin"
              className="bg-secondary/50 border-border focus-visible:ring-1 h-8 text-sm"
            />
          </div>

          <Separator />

          {/* Author scope */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">From</span>
            <ScopeToggle
              value={authorScope}
              options={FEED_SCOPE_OPTIONS}
              onChange={(s) => {
                setAuthorScope(s);
                if (s !== 'people') setAuthorPubkeys([]);
              }}
            />

            {authorScope === 'people' && (
              <div className="space-y-1.5 pt-0.5">
                {authorPubkeys.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {authorPubkeys.map((pk) => (
                      <AuthorChip key={pk} pubkey={pk} onRemove={() => removeAuthor(pk)} />
                    ))}
                  </div>
                )}
                <AuthorFilterDropdown onCommit={(pk) => addAuthor(pk)} />
                <ListPackPicker
                  lists={lists}
                  followPacks={followPacks}
                  value={listPickerValue}
                  onSelectPubkeys={setAuthorPubkeys}
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Kind multi-select */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Kinds</span>
            <MultiKindPicker
              selectedKinds={selectedKinds}
              options={kindOptions}
              onChange={setSelectedKinds}
            />
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 pt-2 sm:flex-col">
          <Button
            className="w-full gap-2"
            onClick={handleSave}
            disabled={!label.trim() || isPending}
          >
            {isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Check className="size-4" />}
            {isEditing ? 'Save changes' : 'Add feed'}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
