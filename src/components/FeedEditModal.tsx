/**
 * FeedEditModal
 *
 * Modal for creating or editing a saved home feed tab.
 * Produces a kind:777 spell event from the filter UI.
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
import { buildKindOptions, parseSelectedKinds } from '@/lib/feedFilterUtils';
import {
  MultiKindPicker,
  AuthorChip,
  AuthorFilterDropdown,
  ScopeToggle,
  ListPackPicker,
} from '@/components/SavedFeedFiltersEditor';
import type { ScopeOption } from '@/components/SavedFeedFiltersEditor';
import { useUserLists, useMatchedListId } from '@/hooks/useUserLists';
import { useFollowPacks } from '@/hooks/useFollowPacks';
import { buildSpellTags, buildUnsignedSpell } from '@/lib/spellEngine';
import type { NostrEvent } from '@nostrify/nostrify';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuthorScope = 'anyone' | 'follows' | 'people';

interface FeedEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the modal is in "edit" mode. */
  initialLabel?: string;
  /** Initial spell event (for edit mode — tags are parsed to seed the form). */
  initialSpell?: NostrEvent;
  /** Called when the user confirms. */
  onSave: (label: string, spell: NostrEvent) => Promise<void>;
  isPending?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive the author scope from a spell event's tags. */
function spellToScope(spell: NostrEvent | undefined): AuthorScope {
  if (!spell) return 'anyone';
  const authors = spell.tags.find(([t]) => t === 'authors')?.slice(1) ?? [];
  if (authors.includes('$contacts')) return 'follows';
  if (authors.length > 0) return 'people';
  return 'anyone';
}

/** Extract explicit author pubkeys from a spell event (excluding variables). */
function spellToAuthorPubkeys(spell: NostrEvent | undefined): string[] {
  if (!spell) return [];
  const authors = spell.tags.find(([t]) => t === 'authors')?.slice(1) ?? [];
  return authors.filter((a) => !a.startsWith('$'));
}

/** Extract kinds from a spell event's k tags. */
function spellToKinds(spell: NostrEvent | undefined): string[] {
  if (!spell) return [];
  return spell.tags.filter(([t]) => t === 'k').map(([, v]) => v);
}

/** Extract search query from a spell event. */
function spellToSearch(spell: NostrEvent | undefined): string {
  if (!spell) return '';
  return spell.tags.find(([t]) => t === 'search')?.[1] ?? '';
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
  initialSpell,
  onSave,
  isPending = false,
}: FeedEditModalProps) {
  const isEditing = !!initialLabel;
  const kindOptions = useMemo(() => buildKindOptions(), []);
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();

  const [label, setLabel] = useState(() => initialLabel ?? '');
  const [authorScope, setAuthorScope] = useState<AuthorScope>(() => spellToScope(initialSpell));
  const [authorPubkeys, setAuthorPubkeys] = useState<string[]>(() => spellToAuthorPubkeys(initialSpell));
  const [selectedKinds, setSelectedKinds] = useState<string[]>(() => spellToKinds(initialSpell));
  const [search, setSearch] = useState(() => spellToSearch(initialSpell));

  // Reset all state when the modal opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setLabel(initialLabel ?? '');
      setAuthorScope(spellToScope(initialSpell));
      setAuthorPubkeys(spellToAuthorPubkeys(initialSpell));
      setSelectedKinds(spellToKinds(initialSpell));
      setSearch(spellToSearch(initialSpell));
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

    // Build authors array
    let authors: string[] | undefined;
    if (authorScope === 'follows') {
      authors = ['$contacts'];
    } else if (authorScope === 'people' && authorPubkeys.length > 0) {
      authors = authorPubkeys;
    }

    const kinds = selectedKinds.map(Number).filter((n) => !isNaN(n) && n > 0);

    const tags = buildSpellTags({
      name: label.trim(),
      kinds: kinds.length > 0 ? kinds : undefined,
      authors,
      search: search.trim() || undefined,
    });

    await onSave(label.trim(), buildUnsignedSpell(tags));
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
              className="bg-secondary/50 border-border focus-visible:ring-1 h-8 text-base md:text-sm"
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
