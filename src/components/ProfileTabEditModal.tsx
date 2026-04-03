/**
 * ProfileTabEditModal
 *
 * Modal for adding or editing a custom profile tab (kind 16769).
 * Produces a kind:777 spell event from the UI state.
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
import { buildSpellTags, buildUnsignedSpell, spellAuthors, spellAuthorPubkeys, spellKinds, spellSearch } from '@/lib/spellEngine';
import type { ProfileTab } from '@/lib/profileTabsEvent';


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

/** Derive the profile-specific author scope from a spell draft's authors array. */
function draftToProfileScope(authors: string[], ownerPubkey: string): ProfileAuthorScope {
  // Detect "me" scope: either the literal owner pubkey or the $me variable
  if (authors.length === 1 && (authors[0] === ownerPubkey || authors[0] === '$me')) return 'me';
  if (authors.includes('$contacts')) return 'contacts';
  if (authors.length > 0) return 'people';
  return 'global';
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

  const [label, setLabel] = useState(tab?.label ?? '');
  const [query, setQuery] = useState(() => spellSearch(tab?.spell));
  const [authorScope, setAuthorScope] = useState<ProfileAuthorScope>(() => draftToProfileScope(spellAuthors(tab?.spell), ownerPubkey));
  const [peoplePubkeys, setPeoplePubkeys] = useState<string[]>(() => spellAuthorPubkeys(tab?.spell, ownerPubkey));
  const [selectedKinds, setSelectedKinds] = useState<string[]>(() => spellKinds(tab?.spell));
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
  useEffect(() => {
    if (open) {
      setLabel(tab?.label ?? '');
      setQuery(spellSearch(tab?.spell));
      setAuthorScope(draftToProfileScope(spellAuthors(tab?.spell), ownerPubkey));
      setPeoplePubkeys(spellAuthorPubkeys(tab?.spell, ownerPubkey));
      setSelectedKinds(spellKinds(tab?.spell));
    }
  }, [open, tab, ownerPubkey]);

  const handleSave = async () => {
    if (!label.trim() || isPending) return;

    // Build authors array based on scope
    let authors: string[] | undefined;
    if (authorScope === 'me') {
      // Use the literal owner pubkey so the tab works correctly for visitors
      // (spell engine's $me would resolve to the viewer, not the profile owner)
      authors = [ownerPubkey];
    } else if (authorScope === 'contacts') {
      // $contacts resolves to the viewer's follow list, which is intentional:
      // "show posts from people I follow" changes per viewer.
      // To show the owner's contacts instead, the owner's follow list pubkeys
      // would need to be embedded directly (future enhancement).
      authors = ['$contacts'];
    } else if (authorScope === 'people' && peoplePubkeys.length > 0) {
      authors = peoplePubkeys;
    }

    const kinds = selectedKinds.map(Number).filter((n) => !isNaN(n) && n > 0);

    const tags = buildSpellTags({
      name: label.trim(),
      kinds: kinds.length > 0 ? kinds : undefined,
      authors,
      search: query.trim() || undefined,
    });

    await onSave({ label: label.trim(), spell: buildUnsignedSpell(tags) });
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
