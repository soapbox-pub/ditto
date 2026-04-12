/**
 * ProfileTabEditModal
 *
 * Modal for adding or editing a custom profile tab (kind 16769).
 * Opens with an optional existing tab to edit; otherwise creates a new one.
 *
 * Streamlined for profile tabs: only Search Query, Author Scope (Me / Contacts / People / Global),
 * and multi-select Kind picker.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Loader2, Check, Globe, Users, User, UserSearch,
} from 'lucide-react';
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
import { buildKindOptions, parseSelectedKinds } from '@/lib/feedFilterUtils';
import {
  MultiKindPicker,
  ScopeToggle,
  AuthorChip,
  AuthorFilterDropdown,
  ListPackPicker,
} from '@/components/SavedFeedFiltersEditor';
import type { ScopeOption } from '@/components/SavedFeedFiltersEditor';
import { PortalContainerProvider } from '@/hooks/usePortalContainer';
import { useUserLists, useMatchedListId } from '@/hooks/useUserLists';
import { useFollowPacks } from '@/hooks/useFollowPacks';
import type { ProfileTab, TabFilter } from '@/lib/profileTabsEvent';


interface ProfileTabEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing tab to edit. If undefined, creates a new tab. */
  tab?: ProfileTab;
  /** The profile owner's pubkey — used to pre-populate authors when scope is 'me'. */
  ownerPubkey: string;
  /** Called with the resulting tab on save. */
  onSave: (tab: ProfileTab) => Promise<void>;
  isPending?: boolean;
}

// ─── Author scope type for the 4-way toggle ───────────────────────────────────

type ProfileAuthorScope = 'me' | 'contacts' | 'people' | 'global';

/** Map from simplified scope to filter fields (excluding people's authors which are stored separately). */
function scopeToFilter(scope: ProfileAuthorScope, ownerPubkey: string, peoplePubkeys: string[]): Partial<TabFilter> {
  switch (scope) {
    case 'me':
      return { authors: [ownerPubkey] };
    case 'contacts':
      // Uses $follows variable — handled at event level via var tags
      return { authors: ['$follows'] };
    case 'people':
      return peoplePubkeys.length > 0 ? { authors: peoplePubkeys } : {};
    case 'global':
      return {};
  }
}

/** Derive the simplified scope from a TabFilter. */
function filterToScope(filter: TabFilter, ownerPubkey: string): ProfileAuthorScope {
  const authors = Array.isArray(filter.authors) ? filter.authors as string[] : [];
  if (authors.length === 1 && authors[0] === ownerPubkey) return 'me';
  if (authors.includes('$follows')) return 'contacts';
  if (authors.length > 0) return 'people'; // has specific authors → people scope
  return 'global';
}

/** Extract people pubkeys from a TabFilter (non-variable, non-owner pubkeys). */
function filterToPeoplePubkeys(filter: TabFilter, ownerPubkey: string): string[] {
  const authors = Array.isArray(filter.authors) ? filter.authors as string[] : [];
  if (authors.includes('$follows')) return [];
  if (authors.length === 1 && authors[0] === ownerPubkey) return [];
  return authors.filter((a) => a !== ownerPubkey && !a.startsWith('$'));
}

/** Serialize selected kind values into a kinds array for the filter. */
function serializeSelectedKinds(kinds: string[]): number[] {
  return kinds.map(Number).filter((n) => !isNaN(n) && n > 0);
}

// ─── Author Scope Options ─────────────────────────────────────────────────────

const PROFILE_SCOPE_OPTIONS: ScopeOption<ProfileAuthorScope>[] = [
  { value: 'me', label: 'Me', icon: User },
  { value: 'contacts', label: 'Contacts', icon: Users },
  { value: 'people', label: 'People', icon: UserSearch },
  { value: 'global', label: 'Global', icon: Globe },
];

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ProfileTabEditModal({
  open,
  onOpenChange,
  tab,
  ownerPubkey,
  onSave,
  isPending = false,
}: ProfileTabEditModalProps) {
  const kindOptions = useMemo(() => buildKindOptions(), []);
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();
  const isNew = !tab;

  const initialFilter = useMemo<TabFilter>(() => {
    if (tab) return tab.filter;
    return { authors: [ownerPubkey] };
  }, [tab, ownerPubkey]);

  const [label, setLabel] = useState(tab?.label ?? '');
  const [query, setQuery] = useState(
    typeof initialFilter.search === 'string' ? initialFilter.search : '',
  );
  const [authorScope, setAuthorScope] = useState<ProfileAuthorScope>(
    filterToScope(initialFilter, ownerPubkey),
  );
  const [peoplePubkeys, setPeoplePubkeys] = useState<string[]>(
    filterToPeoplePubkeys(initialFilter, ownerPubkey),
  );
  const [selectedKinds, setSelectedKinds] = useState<string[]>(
    parseSelectedKinds(initialFilter),
  );
  const [portalContainer, setPortalContainer] = useState<HTMLElement | undefined>(undefined);

  const listPickerValue = useMatchedListId(peoplePubkeys);

  const dialogContentRef = useCallback((node: HTMLElement | null) => {
    setPortalContainer(node ?? undefined);
  }, []);

  const addPerson = useCallback((pubkey: string) => {
    setPeoplePubkeys((prev) => prev.includes(pubkey) ? prev : [...prev, pubkey]);
    setAuthorScope('people');
  }, []);

  const removePerson = useCallback((pubkey: string) => {
    setPeoplePubkeys((prev) => prev.filter((p) => p !== pubkey));
  }, []);

  const handleAuthorScopeChange = useCallback((scope: ProfileAuthorScope) => {
    setAuthorScope(scope);
    if (scope !== 'people') {
      setPeoplePubkeys([]);
    }
  }, []);

  // Reset form state whenever the modal opens or the tab being edited changes.
  // This runs as an effect rather than inside onOpenChange because the Dialog
  // does not fire onOpenChange when opened programmatically via the `open` prop.
  useEffect(() => {
    if (open) {
      const f = tab ? tab.filter : { authors: [ownerPubkey] };
      setLabel(tab?.label ?? '');
      setQuery(typeof f.search === 'string' ? f.search : '');
      setAuthorScope(filterToScope(f, ownerPubkey));
      setPeoplePubkeys(filterToPeoplePubkeys(f, ownerPubkey));
      setSelectedKinds(parseSelectedKinds(f));
    }
  }, [open, tab, ownerPubkey]);

  const handleSave = async () => {
    if (!label.trim() || isPending) return;

    const filter: TabFilter = {
      ...scopeToFilter(authorScope, ownerPubkey, peoplePubkeys),
    };

    if (query.trim()) {
      filter.search = query.trim();
    }

    const kinds = serializeSelectedKinds(selectedKinds);
    if (kinds.length > 0) {
      filter.kinds = kinds;
    }

    await onSave({ label: label.trim(), filter });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={dialogContentRef} className="max-w-sm max-h-[90dvh] overflow-y-auto">
        <PortalContainerProvider value={portalContainer}>
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add profile tab' : 'Edit tab'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Tab name */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tab name</span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. My Art, Bitcoin posts..."
              autoFocus
              className="h-9"
            />
          </div>

          <Separator />

          {/* Kind multi-select */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Content Kinds</span>
            <MultiKindPicker
              selectedKinds={selectedKinds}
              options={kindOptions}
              onChange={setSelectedKinds}
            />
          </div>

          <Separator />

          {/* Filter by word */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter by Word</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="e.g. photography, travel..."
              className="bg-secondary/50 border-border focus-visible:ring-1 h-9 text-base md:text-sm"
            />
          </div>

          <Separator />

          {/* Author scope */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Authors</span>
            <ScopeToggle<ProfileAuthorScope> value={authorScope} options={PROFILE_SCOPE_OPTIONS} onChange={handleAuthorScopeChange} size="md" />
            {authorScope === 'people' ? (
              <div className="space-y-1.5">
                {peoplePubkeys.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {peoplePubkeys.map((pk) => (
                      <AuthorChip key={pk} pubkey={pk} onRemove={() => removePerson(pk)} />
                    ))}
                  </div>
                )}
                <AuthorFilterDropdown onCommit={(pubkey) => addPerson(pubkey)} />
                <ListPackPicker
                  lists={lists}
                  followPacks={followPacks}
                  value={listPickerValue}
                  onSelectPubkeys={(pubkeys) => {
                    setPeoplePubkeys(pubkeys);
                    if (pubkeys.length > 0) setAuthorScope('people');
                  }}
                />
              </div>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {authorScope === 'me' && 'Only show your own posts.'}
                {authorScope === 'contacts' && 'Show posts from people you follow.'}
                {authorScope === 'global' && 'Show posts from everyone.'}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 pt-3 sm:flex-col">
          <Button className="w-full gap-2" onClick={handleSave} disabled={!label.trim() || isPending}>
            {isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Check className="size-4" />}
            {isNew ? 'Add tab' : 'Save changes'}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
        </DialogFooter>
        </PortalContainerProvider>
      </DialogContent>
    </Dialog>
  );
}
