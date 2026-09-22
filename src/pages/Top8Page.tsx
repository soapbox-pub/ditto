/**
 * Top8Page (/top-8)
 *
 * Editor for the logged-in user's Top 8 (kind 18678, see NIP.md) — the
 * MySpace Top 8, revived on Nostr.
 *
 * Edits are staged locally and published on Save rather than on every change:
 * reordering a ranked list takes several moves, and publishing a replaceable
 * event per drag would spam relays with intermediate states that followers
 * would see in their feeds.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Crown, GripVertical, Loader2, X } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Link } from 'react-router-dom';

import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';
import { Top8Grid } from '@/components/Top8Grid';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DndContext,
  SortableContext,
  KeyboardSensor,
  PointerSensor,
  arrayMove,
  closestCenter,
  useSensor,
  useSensors,
  useSortable,
  verticalListSortingStrategy,
  CSS as DndCSS,
  type DragEndEvent,
} from '@/lib/sortable';

import { useAppContext } from '@/hooks/useAppContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useToast } from '@/hooks/useToast';
import { TOP8_KIND, TOP8_MAX, useTop8 } from '@/hooks/useTop8';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// One draggable row in the editor
// ---------------------------------------------------------------------------

interface Top8RowProps {
  pubkey: string;
  /** 1-based rank. */
  rank: number;
  onRemove: (pubkey: string) => void;
}

function Top8Row({ pubkey, rank, onRemove }: Top8RowProps) {
  const intl = useIntl();
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);
  const avatarShape = getAvatarShape(metadata);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: pubkey });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform
          ? DndCSS.Transform.toString({ ...transform, x: Math.round(transform.x), y: Math.round(transform.y) })
          : undefined,
        transition,
      }}
      className={cn(
        'flex items-center gap-3 px-3 py-2 rounded-xl border bg-background',
        isDragging && 'z-50 shadow-lg opacity-90',
      )}
      {...attributes}
    >
      {/* Drag handle. Arrow keys move the row one position — the sortable
          engine fires onDragEnd directly, so this is fully keyboard-operable. */}
      <button
        {...listeners}
        className="shrink-0 p-1 -ml-1 rounded cursor-grab active:cursor-grabbing text-muted-foreground/60 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={intl.formatMessage(
          { id: 'top8.edit.reorder', defaultMessage: 'Reorder {name} — use arrow keys to move' },
          { name: displayName },
        )}
      >
        <GripVertical className="size-5" />
      </button>

      <span
        className="shrink-0 flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-xs font-bold tabular-nums"
        aria-hidden
      >
        {rank}
      </span>

      {author.isLoading ? (
        <>
          <Skeleton className="size-10 rounded-full shrink-0" />
          <Skeleton className="h-4 w-32" />
        </>
      ) : (
        <ProfileHoverCard pubkey={pubkey} asChild>
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <Avatar shape={avatarShape} className="size-10 shrink-0">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback>{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{displayName}</span>
          </div>
        </ProfileHoverCard>
      )}

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0 rounded-full size-8 text-muted-foreground hover:text-destructive"
        onClick={() => onRemove(pubkey)}
        aria-label={intl.formatMessage(
          { id: 'top8.edit.remove', defaultMessage: 'Remove {name} from your Top 8' },
          { name: displayName },
        )}
      >
        <X className="size-4" />
      </Button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function Top8Page() {
  const intl = useIntl();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const { top8, isLoading, setTop8 } = useTop8();

  useSeoMeta({
    title: `Top 8 | ${config.appName}`,
    description: 'Curate your eight favorite people on Nostr.',
  });

  // Staged ordering. `null` means "no local edits yet" — read straight through
  // to the published list so a relay update mid-session isn't masked by a
  // stale draft the user never touched.
  const [draft, setDraft] = useState<string[] | null>(null);
  const published = useMemo(() => top8 ?? [], [top8]);
  const list = draft ?? published;

  // Drop the draft once it matches what's published (i.e. the save landed, or
  // the user manually undid every change).
  useEffect(() => {
    if (draft && draft.length === published.length && draft.every((pk, i) => published[i] === pk)) {
      setDraft(null);
    }
  }, [draft, published]);

  const isDirty = draft !== null;
  const isFull = list.length >= TOP8_MAX;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((current) => {
      const base = current ?? published;
      const oldIndex = base.indexOf(String(active.id));
      const newIndex = base.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return base;
      return arrayMove(base, oldIndex, newIndex);
    });
  }, [published]);

  const handleRemove = useCallback((pubkey: string) => {
    setDraft((current) => (current ?? published).filter((pk) => pk !== pubkey));
  }, [published]);

  const handleAdd = useCallback((pubkey: string) => {
    setDraft((current) => {
      const base = current ?? published;
      if (base.includes(pubkey)) {
        toast({
          title: intl.formatMessage({
            id: 'top8.edit.alreadyAdded',
            defaultMessage: 'They are already in your Top 8.',
          }),
        });
        return base;
      }
      if (base.length >= TOP8_MAX) {
        toast({
          title: intl.formatMessage({
            id: 'top8.edit.fullTitle',
            defaultMessage: 'Your Top 8 is full',
          }),
          description: intl.formatMessage({
            id: 'top8.edit.fullDescription',
            defaultMessage: 'Remove someone first — that is the hard part.',
          }),
          variant: 'destructive',
        });
        return base;
      }
      return [...base, pubkey];
    });
  }, [published, toast, intl]);

  const handleSave = () => {
    if (!draft) return;
    setTop8.mutate(draft, {
      onSuccess: () => {
        setDraft(null);
        toast({
          title: intl.formatMessage({ id: 'top8.edit.saved', defaultMessage: 'Top 8 published' }),
        });
      },
      onError: (error) => {
        toast({
          title: intl.formatMessage({ id: 'top8.edit.saveFailed', defaultMessage: 'Failed to publish your Top 8' }),
          description: error instanceof Error ? error.message : undefined,
          variant: 'destructive',
        });
      },
    });
  };

  if (!user) {
    return (
      <main>
        <PageHeader title="Top 8" icon={<Crown className="size-5" />} />
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <Crown className="size-8 text-primary" />
          </div>
          <div className="space-y-2 max-w-xs">
            <h2 className="text-xl font-bold">
              <FormattedMessage id="top8.loggedOut.title" defaultMessage="Pick your favorite eight" />
            </h2>
            <p className="text-muted-foreground text-sm">
              <FormattedMessage
                id="top8.loggedOut.description"
                defaultMessage="Log in to curate a Top 8 and show it off on your profile."
              />
            </p>
          </div>
          <LoginArea className="max-w-60" />
        </div>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title="Top 8" icon={<Crown className="size-5" />}>
        {isDirty && (
          <Button size="sm" className="rounded-full shrink-0" onClick={handleSave} disabled={setTop8.isPending}>
            {setTop8.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
            <FormattedMessage id="top8.edit.save" defaultMessage="Save" />
          </Button>
        )}
      </PageHeader>

      <div className="px-4 pb-8 space-y-6">
        <p className="text-sm text-muted-foreground">
          <FormattedMessage
            id="top8.edit.intro"
            defaultMessage="Your eight favorite people, in order. Drag to rank them — number one goes at the top. Everyone can see your Top 8 on your profile, and your followers see when you rearrange it."
          />
        </p>

        {/* Add someone */}
        <div className="space-y-2">
          <h2 className="text-sm font-medium">
            <FormattedMessage id="top8.edit.addLabel" defaultMessage="Add someone" />
          </h2>
          {isFull ? (
            <Card className="border-dashed">
              <CardContent className="py-4 px-4 text-center">
                <p className="text-sm text-muted-foreground">
                  <FormattedMessage
                    id="top8.edit.fullHint"
                    defaultMessage="Your Top 8 is full. Remove someone to make room."
                  />
                </p>
              </CardContent>
            </Card>
          ) : (
            <ProfileSearchDropdown
              placeholder={intl.formatMessage({
                id: 'top8.edit.searchPlaceholder',
                defaultMessage: 'Search people to add…',
              })}
              hideCountry
              onSelect={(profile) => handleAdd(profile.pubkey)}
            />
          )}
        </div>

        {/* The list */}
        {isLoading && published.length === 0 ? (
          <ul className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl border">
                <Skeleton className="size-5 shrink-0" />
                <Skeleton className="size-7 rounded-full shrink-0" />
                <Skeleton className="size-10 rounded-full shrink-0" />
                <Skeleton className="h-4 w-32" />
              </li>
            ))}
          </ul>
        ) : list.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <p className="text-muted-foreground max-w-sm mx-auto">
                <FormattedMessage
                  id="top8.edit.emptyState"
                  defaultMessage="Nobody in your Top 8 yet. Search above to add your first pick."
                />
              </p>
            </CardContent>
          </Card>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={list} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {list.map((pubkey, i) => (
                  <Top8Row key={pubkey} pubkey={pubkey} rank={i + 1} onRemove={handleRemove} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        {/* Unsaved-changes bar — repeated at the bottom so a long list doesn't
            hide the Save button behind a scroll. */}
        {isDirty && (
          <div className="flex items-center gap-3 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3">
            <p className="text-sm flex-1">
              <FormattedMessage id="top8.edit.unsaved" defaultMessage="You have unsaved changes." />
            </p>
            <Button variant="ghost" size="sm" onClick={() => setDraft(null)} disabled={setTop8.isPending}>
              <FormattedMessage id="top8.edit.discard" defaultMessage="Discard" />
            </Button>
            <Button size="sm" onClick={handleSave} disabled={setTop8.isPending}>
              {setTop8.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" />}
              <FormattedMessage id="top8.edit.save" defaultMessage="Save" />
            </Button>
          </div>
        )}

        {/* Preview of the published list, exactly as others see it */}
        {published.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium">
                <FormattedMessage id="top8.edit.previewTitle" defaultMessage="How it looks on your profile" />
              </h2>
              <Link
                to={`/${nip19.naddrEncode({ kind: TOP8_KIND, pubkey: user.pubkey, identifier: '' })}`}
                className="text-sm text-primary hover:underline shrink-0"
              >
                <FormattedMessage id="top8.edit.viewPublished" defaultMessage="View published" />
              </Link>
            </div>
            <Top8Grid pubkeys={published} columns={4} size="sm" />
          </section>
        )}
      </div>
    </main>
  );
}

export default Top8Page;
