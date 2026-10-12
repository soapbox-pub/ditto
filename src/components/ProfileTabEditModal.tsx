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
import { defineMessages, FormattedMessage, useIntl } from 'react-intl';
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
import { cn } from '@/lib/utils';
import { buildKindOptions, parseSelectedKinds } from '@/lib/feedFilterUtils';
import {
  TAB_MEDIA_CATEGORIES,
  TAB_MEDIA_ICONS,
  parseMediaSearch,
  buildTabSearch,
  type TabMediaCategory,
} from '@/lib/tabMediaFilter';
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

const scopeMessages = defineMessages({
  me: { id: 'profileTabEdit.scope.me', defaultMessage: 'Me' },
  contacts: { id: 'profileTabEdit.scope.contacts', defaultMessage: 'Contacts' },
  people: { id: 'profileTabEdit.scope.people', defaultMessage: 'People' },
  global: { id: 'profileTabEdit.scope.global', defaultMessage: 'Global' },
});

const PROFILE_SCOPE_ICONS: { value: ProfileAuthorScope; icon: ScopeOption<ProfileAuthorScope>['icon'] }[] = [
  { value: 'me', icon: User },
  { value: 'contacts', icon: Users },
  { value: 'people', icon: UserSearch },
  { value: 'global', icon: Globe },
];

const mediaMessages = defineMessages({
  images: { id: 'profileTabEdit.media.images', defaultMessage: 'Images' },
  videos: { id: 'profileTabEdit.media.videos', defaultMessage: 'Videos' },
  none: { id: 'profileTabEdit.media.none', defaultMessage: 'No media' },
});

// ─── Main Modal ───────────────────────────────────────────────────────────────

export function ProfileTabEditModal({
  open,
  onOpenChange,
  tab,
  ownerPubkey,
  onSave,
  isPending = false,
}: ProfileTabEditModalProps) {
  const intl = useIntl();
  const kindOptions = useMemo(() => buildKindOptions(), []);
  const scopeOptions = useMemo<ScopeOption<ProfileAuthorScope>[]>(
    () => PROFILE_SCOPE_ICONS.map(({ value, icon }) => ({ value, icon, label: intl.formatMessage(scopeMessages[value]) })),
    [intl],
  );
  const { lists } = useUserLists();
  const { data: followPacks = [] } = useFollowPacks();
  const isNew = !tab;

  const initialFilter = useMemo<TabFilter>(() => {
    if (tab) return tab.filter;
    return { authors: [ownerPubkey] };
  }, [tab, ownerPubkey]);

  const initialMedia = useMemo(
    () => parseMediaSearch(typeof initialFilter.search === 'string' ? initialFilter.search : ''),
    [initialFilter.search],
  );

  const [label, setLabel] = useState(tab?.label ?? '');
  const [query, setQuery] = useState(initialMedia.query);
  const [mediaCategories, setMediaCategories] = useState<Set<TabMediaCategory>>(initialMedia.categories);
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

  // Toggle a media category. Images/Videos combine (inclusive OR); "No media"
  // is the opposite of having media, so it's mutually exclusive with them.
  const toggleMediaCategory = useCallback((category: TabMediaCategory) => {
    setMediaCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else if (category === 'none') {
        next.clear();
        next.add('none');
      } else {
        next.delete('none');
        next.add(category);
      }
      return next;
    });
  }, []);

  // Reset form state whenever the modal opens or the tab being edited changes.
  // This runs as an effect rather than inside onOpenChange because the Dialog
  // does not fire onOpenChange when opened programmatically via the `open` prop.
  useEffect(() => {
    if (open) {
      const f = tab ? tab.filter : { authors: [ownerPubkey] };
      const media = parseMediaSearch(typeof f.search === 'string' ? f.search : '');
      setLabel(tab?.label ?? '');
      setQuery(media.query);
      setMediaCategories(media.categories);
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

    const search = buildTabSearch(query, mediaCategories);
    if (search) {
      filter.search = search;
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
          <DialogTitle>
            {isNew
              ? <FormattedMessage id="profileTabEdit.addTitle" defaultMessage="Add profile tab" />
              : <FormattedMessage id="profileTabEdit.editTitle" defaultMessage="Edit tab" />}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          {/* Tab name */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide"><FormattedMessage id="profileTabEdit.tabName" defaultMessage="Tab name" /></span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder={intl.formatMessage({ id: 'profileTabEdit.tabNamePlaceholder', defaultMessage: 'e.g. My Art, Bitcoin posts...' })}
              autoFocus
              className="h-9"
            />
          </div>

          <Separator />

          {/* Kind multi-select */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide"><FormattedMessage id="profileTabEdit.contentKinds" defaultMessage="Content Kinds" /></span>
            <MultiKindPicker
              selectedKinds={selectedKinds}
              options={kindOptions}
              onChange={setSelectedKinds}
            />
          </div>

          <Separator />

          {/* Media content type — Images/Videos combine; "No media" is exclusive */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide"><FormattedMessage id="sidebar.section.media" defaultMessage="Media" /></span>
            <div className="rounded-lg border border-border overflow-hidden flex">
              {TAB_MEDIA_CATEGORIES.map((value) => {
                const Icon = TAB_MEDIA_ICONS[value];
                const active = mediaCategories.has(value);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleMediaCategory(value)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground',
                    )}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <FormattedMessage {...mediaMessages[value]} />
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {mediaCategories.has('none')
                ? <FormattedMessage id="profileTabEdit.media.noneHint" defaultMessage="Only show posts without media." />
                : mediaCategories.has('images') && mediaCategories.has('videos')
                  ? <FormattedMessage id="profileTabEdit.media.anyHint" defaultMessage="Only show posts with media (images or videos)." />
                  : mediaCategories.has('images')
                    ? <FormattedMessage id="profileTabEdit.media.imagesHint" defaultMessage="Only show posts with images." />
                    : mediaCategories.has('videos')
                      ? <FormattedMessage id="profileTabEdit.media.videosHint" defaultMessage="Only show posts with videos." />
                      : <FormattedMessage id="profileTabEdit.media.allHint" defaultMessage="Show all posts, with or without media." />}
            </p>
          </div>

          <Separator />

          {/* Filter by word */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide"><FormattedMessage id="profileTabEdit.filterByWord" defaultMessage="Filter by Word" /></span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={intl.formatMessage({ id: 'profileTabEdit.wordPlaceholder', defaultMessage: 'e.g. photography, travel...' })}
              className="bg-secondary/50 border-border focus-visible:ring-1 h-9 text-base md:text-sm"
            />
          </div>

          <Separator />

          {/* Author scope */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide"><FormattedMessage id="profileTabEdit.authors" defaultMessage="Authors" /></span>
            <ScopeToggle<ProfileAuthorScope> value={authorScope} options={scopeOptions} onChange={handleAuthorScopeChange} size="md" />
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
                {authorScope === 'me' && <FormattedMessage id="profileTabEdit.scope.meHint" defaultMessage="Only show your own posts." />}
                {authorScope === 'contacts' && <FormattedMessage id="profileTabEdit.scope.contactsHint" defaultMessage="Show posts from people you follow." />}
                {authorScope === 'global' && <FormattedMessage id="profileTabEdit.scope.globalHint" defaultMessage="Show posts from everyone." />}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 pt-3 sm:flex-col">
          <Button className="w-full gap-2" onClick={handleSave} disabled={!label.trim() || isPending}>
            {isPending
              ? <Loader2 className="size-4 animate-spin" />
              : <Check className="size-4" />}
            {isNew
              ? <FormattedMessage id="settings.feed.addTab" defaultMessage="Add tab" />
              : <FormattedMessage id="profileTabEdit.saveChanges" defaultMessage="Save changes" />}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)} disabled={isPending}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
        </DialogFooter>
        </PortalContainerProvider>
      </DialogContent>
    </Dialog>
  );
}
