/**
 * ProfileTabEditModal
 *
 * Modal for adding or editing a custom profile tab (kind 16769).
 * Opens with an optional existing tab to edit; otherwise creates a new one.
 */
import { useState, useMemo } from 'react';
import { Loader2, Check } from 'lucide-react';
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
import { SavedFeedFiltersEditor, buildKindOptions } from '@/components/SavedFeedFiltersEditor';
import type { ProfileTab } from '@/lib/profileTabsEvent';
import type { SavedFeedFilters } from '@/contexts/AppContext';

const DEFAULT_FILTERS: SavedFeedFilters = {
  query: '',
  mediaType: 'all',
  language: 'global',
  platform: 'nostr',
  kindFilter: 'all',
  customKindText: '',
  authorScope: 'anyone',
  authorPubkeys: [],
  sort: 'recent',
};

interface ProfileTabEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Existing tab to edit. If undefined, creates a new tab. */
  tab?: ProfileTab;
  /** The profile owner's pubkey — used to pre-populate authorPubkeys when scope is 'people'. */
  ownerPubkey: string;
  /** Called with the resulting tab on save. */
  onSave: (tab: ProfileTab) => Promise<void>;
  isPending?: boolean;
}

export function ProfileTabEditModal({
  open,
  onOpenChange,
  tab,
  ownerPubkey,
  onSave,
  isPending = false,
}: ProfileTabEditModalProps) {
  const kindOptions = useMemo(() => buildKindOptions(), []);
  const isNew = !tab;

  const initialFilters = useMemo<SavedFeedFilters>(() => {
    if (tab) return tab.filters;
    // New tab: default to showing the owner's own posts
    return {
      ...DEFAULT_FILTERS,
      authorScope: 'people',
      authorPubkeys: [ownerPubkey],
    };
  }, [tab, ownerPubkey]);

  const [label, setLabel] = useState(tab?.label ?? '');
  const [filters, setFilters] = useState<SavedFeedFilters>(initialFilters);

  // Reset state when modal opens
  const handleOpenChange = (o: boolean) => {
    if (o) {
      setLabel(tab?.label ?? '');
      setFilters(initialFilters);
    }
    onOpenChange(o);
  };

  const handleSave = async () => {
    if (!label.trim() || isPending) return;
    await onSave({ label: label.trim(), filters });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'Add profile tab' : 'Edit tab'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Tab name */}
          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tab name</span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              placeholder="e.g. My Art, Bitcoin posts…"
              autoFocus
            />
          </div>

          <Separator />

          <SavedFeedFiltersEditor
            value={filters}
            onChange={(patch) => setFilters((prev) => ({ ...prev, ...patch }))}
            kindOptions={kindOptions}
            hideFrom
            hideSort
          />
        </div>

        <DialogFooter className="flex-col gap-2 pt-2 sm:flex-col">
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
      </DialogContent>
    </Dialog>
  );
}
