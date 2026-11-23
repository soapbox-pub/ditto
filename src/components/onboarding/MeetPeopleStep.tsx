import { useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BookOpen, Camera, Check, ChefHat, ChevronDown, ChevronRight, Gamepad2, Leaf, Loader2, Music, Palette, PawPrint, Pause, Play, Plus,
  Bird, Box, RotateCcw, Egg, Gem, Hammer, Heart, Layers, Mail, MoonStar, Orbit, Podcast, Scissors, SmilePlus, Sparkles, Sprout, Users,
  type LucideIcon,
} from 'lucide-react';
import { defineMessage, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { MemoryRouter, useInRouterContext } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { HorizontalScroll } from '@/components/discovery/HorizontalScroll';
import { ThemePhone } from '@/components/onboarding/ThemePhone';
import { ArticleContent } from '@/components/ArticleContent';
import { FallbackImage } from '@/components/FallbackImage';
import { Nip05Badge } from '@/components/Nip05Badge';
import { NoteCard } from '@/components/NoteCard';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { useAppContext } from '@/hooks/useAppContext';
import { useTheme } from '@/hooks/useTheme';
import { ThemePreviewBar } from '@/components/ThemePreviewBar';
import { AudioPlayerProvider } from '@/contexts/AudioPlayerContext';
import { AudioPlayerContext } from '@/contexts/audioPlayerContextDef';
import { DittoLogo } from '@/components/DittoLogo';
import { ThumbnailImage } from '@/components/ThumbnailImage';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AdaptiveDialog, AdaptiveDialogContent, AdaptiveDialogDescription, AdaptiveDialogTitle } from '@/components/AdaptiveDialog';
import { Skeleton } from '@/components/ui/skeleton';
import { WebxdcEmbed } from '@/components/WebxdcEmbed';
import { TarotCard } from '@/components/tarot/TarotCard';
import { BlobbiStageVisual } from '@/blobbi/ui/BlobbiStageVisual';
import { parseBlobbiEvent } from '@blobbi-kit/core';
import type { NostrEvent } from '@nostrify/nostrify';
import { useWikidataEntity } from '@/hooks/useWikidataEntity';
import { useWikipediaSummary } from '@/hooks/useWikipediaSummary';
import { parseCardsFromEvent } from '@/lib/tarot/cards';
import { tarotCardName } from '@/lib/tarot/text';
import { useTarotText } from '@/hooks/useTarotText';
import { CenterColumnContext } from '@/contexts/LayoutContext';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { toast } from '@/hooks/useToast';
import {
  isOffTopicProfile,
  MIN_PEOPLE,
  PEOPLE,
  useWelcomePeople,
  type WelcomeCover,
  type WelcomeDittoThing,
  type WelcomeTalk,
  type WelcomeGame,
  type WelcomePerson,
  type WelcomePhoto,
  type WelcomePreview,
  type WelcomeSection,
  type WelcomeTheme,
  type WelcomeTrack,
} from '@/hooks/useWelcomePeople';
import { getAvatarShape } from '@/lib/avatarShape';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { loadFont, sanitizeCssString } from '@/lib/fontLoader';
import { profileName } from '@/lib/getDisplayName';
import { formatReadingTime } from '@/lib/articleHelpers';
import type { ImetaEntry } from '@/lib/imeta';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { THEME_DEFINITION_KIND, themeEventToConfig } from '@/lib/themeEvent';
import { clearThemePreview, startThemePreview, useThemePreview } from '@/lib/themePreview';
import { cn } from '@/lib/utils';
import { coreToTokens, toThemeVar } from '@/themes';
import { isDarkTheme } from '@/lib/colorUtils';

const hsl = (value: string) => `hsl(${value})`;

interface MeetPeopleStepProps {
  onNext: (didFollow: boolean) => void;
  onBack: () => void;
  /**
   * Hex pubkey of the just-generated signup key. When set, follows are only
   * published if the active signer matches, so they can't land on a
   * previously logged-in account.
   */
  expectedPubkey?: string;
}

/**
 * Onboarding follow step. People are grouped by what they make (themes,
 * nature photos, games, music), and each card previews their work so you can
 * try it before deciding: wear their themes, flip through their photos, play
 * their game or their song. Picked people are followed in one kind 3 publish
 * on Continue.
 */
export function MeetPeopleStep({ onNext, onBack, expectedPubkey }: MeetPeopleStepProps) {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { store } = useNostrStorage();
  const { data, isPending } = useWelcomePeople();
  // The theme to go back to on Reset theme: whatever was on when the step opened.
  const { theme, customTheme } = useTheme();
  const [initialTheme] = useState(() => ({ theme, customTheme }));

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [column, setColumn] = useState<HTMLElement | null>(null);
  const audio = useTrackPreview();
  // People whose work didn't load. Their cards step aside, and they can't be followed from here.
  const [broken, setBroken] = useState<ReadonlySet<string>>(new Set());
  const markBroken = useCallback((pubkey: string) => {
    setBroken((prev) => (prev.has(pubkey) ? prev : new Set(prev).add(pubkey)));
  }, []);

  // Someone without a picture reads like a bot; drop them once profiles are in.
  const allPubkeys = useMemo(() => data?.flatMap((section) => section.people.map((p) => p.pubkey)) ?? [], [data]);
  const { data: authors, isFetched } = useAuthors(allPubkeys);
  const sections = useMemo(
    () => (data ?? [])
      .map((section) => ({
        ...section,
        people: (isFetched
          ? section.people.filter((p) => {
            if (p.pubkey === user?.pubkey) return false;
            const m = authors?.get(p.pubkey)?.metadata;
            if (!m?.picture || m.bot) return false;
            return section.vetted || !isOffTopicProfile(`${m.name ?? ''} ${m.display_name ?? ''} ${m.about ?? ''}`);
          })
          : section.people).slice(0, PEOPLE),
      }))
      .filter((section) => section.people.length >= MIN_PEOPLE)
      .map((section) => ({ ...section, people: section.people.filter((p) => !broken.has(p.pubkey)) })),
    [data, authors, isFetched, user?.pubkey, broken],
  );

  // Only people still on the page get followed: a pick can drop out once
  // profiles load or their work fails to.
  const picks = useMemo(() => {
    const shown = new Set(sections.flatMap((section) => section.people.map((p) => p.pubkey)));
    return [...selected].filter((pk) => shown.has(pk));
  }, [sections, selected]);

  /** Follow everyone shown in a section, or clear them if they're all picked already. */
  const toggleAll = useCallback((pubkeys: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const all = pubkeys.every((pk) => next.has(pk));
      for (const pk of pubkeys) {
        if (all) next.delete(pk);
        else next.add(pk);
      }
      return next;
    });
  }, []);

  const toggle = useCallback((pubkey: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pubkey)) next.delete(pubkey);
      else next.add(pubkey);
      return next;
    });
  }, []);

  const handleContinue = useCallback(async () => {
    audio.stop();
    clearThemePreview();
    if (!user || picks.length === 0) {
      onNext(false);
      return;
    }
    if (expectedPubkey && user.pubkey !== expectedPubkey) {
      toast({
        title: intl.formatMessage({ id: 'onboarding.follows.notSaved', defaultMessage: 'Follows not saved' }),
        description: intl.formatMessage({ id: 'onboarding.follows.notSavedDescription', defaultMessage: 'The new account is not active yet, so your follows were not saved (this prevents modifying another account). You can follow people later from the app.' }),
        variant: 'destructive',
      });
      onNext(false);
      return;
    }

    setSubmitting(true);
    try {
      const prev = await fetchFreshEvent(nostr, { kinds: [3], authors: [user.pubkey] }, { store });
      const existingPTags = prev?.tags.filter(([n]) => n === 'p') ?? [];
      const nonPTags = prev?.tags.filter(([n]) => n !== 'p') ?? [];
      const existing = new Set(existingPTags.map(([, pk]) => pk));
      const newPTags = picks.filter((pk) => !existing.has(pk)).map((pk) => ['p', pk]);

      await publishEvent({
        kind: 3,
        content: prev?.content ?? '',
        tags: [...nonPTags, ...existingPTags, ...newPTags],
        prev: prev ?? undefined,
      });
      onNext(true);
    } catch (error) {
      console.error('Failed to follow:', error);
      toast({
        title: intl.formatMessage({ id: 'onboarding.follows.failed', defaultMessage: "Couldn't save your follows" }),
        description: intl.formatMessage({ id: 'onboarding.follows.failedDescription', defaultMessage: 'Something went wrong. You can follow people later from the app.' }),
        variant: 'destructive',
      });
      onNext(false);
    } finally {
      setSubmitting(false);
    }
  }, [audio, user, picks, expectedPubkey, nostr, store, publishEvent, onNext, intl]);

  return (
    <CenterColumnContext.Provider value={column}>
      <div ref={setColumn} className="flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 duration-400">
        <div className="flex flex-col items-center space-y-2 text-center">
          <DittoLogo size={48} className="mb-2" />
          <h2 className="text-xl font-semibold tracking-tight">
            <FormattedMessage id="onboarding.people.title" defaultMessage="Meet some people" />
          </h2>
          <p className="text-sm text-muted-foreground">
            <FormattedMessage
              id="onboarding.people.description"
              defaultMessage="People making things here right now. Try their work, and follow anyone who catches your eye."
            />
          </p>
        </div>

        <div className="-mx-6 space-y-1">
          {isPending ? (
            <PeopleSkeleton />
          ) : sections.length === 0 ? (
            <div className="px-6">
              <Card className="border-dashed">
                <CardContent className="py-12 px-8 text-center">
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    <FormattedMessage
                      id="onboarding.people.empty"
                      defaultMessage="No one to suggest right now. You can find people to follow on Discover later."
                    />
                  </p>
                </CardContent>
              </Card>
            </div>
          ) : (
            sections.map((section) => (
              <PeopleSection
                key={section.id}
                section={section}
                selected={selected}
                onToggle={toggle}
                onToggleAll={toggleAll}
                onBroken={markBroken}
                audio={audio}
                action={section.id === 'themes' ? <ResetThemeButton initial={initialTheme} /> : undefined}
              />
            ))
          )}
        </div>

        <StandaloneThemePreviewBar />

        <div className="sticky bottom-0 z-10 -mx-6 -mb-12 flex gap-3 bg-gradient-to-t from-background from-60% to-transparent px-6 pt-8 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <Button variant="ghost" onClick={() => { audio.stop(); clearThemePreview(); onBack(); }} disabled={submitting} className="flex-1 rounded-full h-11">
            <FormattedMessage id="onboarding.back" defaultMessage="Back" />
          </Button>
          <Button onClick={handleContinue} disabled={submitting} className="flex-1 rounded-full h-11 gap-1.5">
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <FormattedMessage id="onboarding.follows.following" defaultMessage="Following..." />
              </>
            ) : (
              <>
                {picks.length > 0
                  ? <FormattedMessage id="onboarding.people.follow" defaultMessage="Follow {count}" values={{ count: picks.length }} />
                  : <FormattedMessage id="onboarding.follows.skip" defaultMessage="Skip for now" />}
                <ChevronRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </CenterColumnContext.Provider>
  );
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  regulars: Orbit,
  themes: Sparkles,
  nature: Leaf,
  artists: Palette,
  photography: Camera,
  cooks: ChefHat,
  music: Music,
  pets: PawPrint,
  games: Gamepad2,
  builders: Hammer,
  gardeners: Sprout,
  makers: Scissors,
  writers: BookOpen,
  podcasts: Podcast,
};

/**
 * Work that is an object keeps its shape (themes on a little phone, music as a
 * record, games as cartridges). Everything else is a plain tile.
 */
type ArtStyle = 'phone' | 'tile' | 'vinyl' | 'cartridge';

function styleFor(preview: WelcomePreview): ArtStyle {
  switch (preview.type) {
    case 'themes': return 'phone';
    case 'track': return 'vinyl';
    case 'game': return 'cartridge';
    default: return 'tile';
  }
}

/** Phones are tall, so they're drawn narrower to keep rows even. */
function cardWidth(style: ArtStyle): string {
  return style === 'phone' ? 'w-[112px]' : 'w-[148px]';
}

/**
 * How a section lays its people out. Mixing these down the page gives it a
 * front-page rhythm instead of a stack of identical rows:
 *  - row: a gliding row of cards (snaps card by card).
 *  - lead: one big story with two smaller ones beside it, the rest gliding below.
 *  - list: a few tight rows, for people whose work is words.
 *  - headlines: a blog front: one lead article, then headlines with thumbnails.
 */
type SectionLayout = 'row' | 'lead' | 'lead-flip' | 'list' | 'headlines';

const SECTION_LAYOUTS: Record<string, SectionLayout> = {
  regulars: 'row',
  themes: 'row',
  nature: 'lead',
  artists: 'row',
  photography: 'lead-flip',
  cooks: 'row',
  music: 'row',
  pets: 'lead',
  games: 'row',
  builders: 'list',
  gardeners: 'lead-flip',
  makers: 'row',
  writers: 'headlines',
  podcasts: 'headlines',
};

function PeopleSection({ section, selected, onToggle, onToggleAll, onBroken, audio, action }: {
  section: WelcomeSection;
  selected: Set<string>;
  onToggle: (pubkey: string) => void;
  onToggleAll: (pubkeys: string[]) => void;
  /** Someone's work couldn't load. */
  onBroken: (pubkey: string) => void;
  audio: TrackPreview;
  /** Extra control for the section header, before Follow all. */
  action?: ReactNode;
}) {
  const Icon = SECTION_ICONS[section.id] ?? Users;
  const [open, setOpen] = useState<WelcomePerson>();
  const layout = SECTION_LAYOUTS[section.id] ?? 'row';
  // Lists and headlines start with a few and expand; rows show everyone (they
  // scroll). Follow all only ever follows the people on the page.
  const [expanded, setExpanded] = useState(false);
  const initial = layout === 'list' ? 4 : layout === 'headlines' ? 5 : section.people.length;
  const people = expanded ? section.people : section.people.slice(0, initial);
  const hidden = section.people.length - people.length;
  const showMore = hidden > 0 && (
    <button
      type="button"
      onClick={() => setExpanded(true)}
      className="mt-1 flex w-full items-center justify-center gap-1 rounded-full py-2 text-sm font-medium text-primary hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FormattedMessage id="onboarding.people.showMore" defaultMessage="Show {count} more" values={{ count: hidden }} />
      <ChevronDown className="size-4" />
    </button>
  );
  const pubkeys = people.map((p) => p.pubkey);
  const allPicked = pubkeys.every((pk) => selected.has(pk));
  const reveal = useReveal<HTMLElement>();

  const card = (person: WelcomePerson, variant: CardVariant = 'card') => (
    <PersonCard
      key={person.pubkey}
      pubkey={person.pubkey}
      variant={variant}
      className={variant === 'card' ? cardWidth(styleFor(person.preview)) : undefined}
      renderArt={() => <PreviewArt preview={person.preview} audio={audio} onBroken={() => onBroken(person.pubkey)} />}
      subtitle={previewSubtitle(person.preview)}
      selected={selected.has(person.pubkey)}
      onToggle={() => onToggle(person.pubkey)}
      onOpen={() => setOpen(person)}
    />
  );

  const row = (people: WelcomePerson[]) => people.length > 0 && (
    <HorizontalScroll className="snap-x snap-mandatory scroll-px-6 items-start gap-4 px-6 pt-1 pb-3 [&>*]:snap-start">
      {people.map((person) => card(person))}
    </HorizontalScroll>
  );

  let body: ReactNode;
  if (layout === 'headlines') {
    const [lead, ...rest] = people;
    body = (
      <div className="px-6">
        <Headline person={lead} lead selected={selected.has(lead.pubkey)} onToggle={() => onToggle(lead.pubkey)} onOpen={() => setOpen(lead)} />
        <div className="mt-2 divide-y divide-border-subtle">
          {rest.map((person) => (
            <Headline key={person.pubkey} person={person} selected={selected.has(person.pubkey)} onToggle={() => onToggle(person.pubkey)} onOpen={() => setOpen(person)} />
          ))}
        </div>
        {showMore}
      </div>
    );
  } else if (layout === 'list') {
    body = (
      <div className="px-6">
        <div className="divide-y divide-border-subtle">
        {people.map((person) => (
          <PersonRow
            key={person.pubkey}
            person={person}
            audio={audio}
            selected={selected.has(person.pubkey)}
            onToggle={() => onToggle(person.pubkey)}
            onOpen={() => setOpen(person)}
          />
        ))}
        </div>
        {showMore}
      </div>
    );
  } else if (layout === 'lead' || layout === 'lead-flip') {
    const [lead, ...rest] = people;
    const side = rest.slice(0, 2);
    body = (
      <>
        <div className={cn('grid grid-cols-3 gap-3 px-6 pb-4', layout === 'lead-flip' && '[&>*:first-child]:order-last')}>
          <div className="col-span-2">{card(lead, 'lead')}</div>
          <div className="flex flex-col gap-3">{side.map((person) => card(person, 'compact'))}</div>
        </div>
        {row(rest.slice(2))}
      </>
    );
  } else {
    body = row(people);
  }

  return (
    <section ref={reveal.ref} className={cn('[contain-intrinsic-size:auto_480px] [content-visibility:auto] motion-safe:transition-[opacity,transform] motion-safe:duration-700 motion-safe:ease-out', !reveal.seen && 'motion-safe:translate-y-4 motion-safe:opacity-0')}>
      <div className="flex items-center justify-between px-6 pt-6 pb-3">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Icon className="size-5 shrink-0" />
          <FormattedMessage {...section.label} />
        </h3>
        <div className="flex items-center gap-4">
          {action}
          <button
            type="button"
            onClick={() => onToggleAll(pubkeys)}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:underline"
          >
            {allPicked
              ? <FormattedMessage id="onboarding.people.unpickAll" defaultMessage="Clear" />
              : <FormattedMessage id="onboarding.people.pickAll" defaultMessage="Follow all {count}" values={{ count: pubkeys.length }} />}
          </button>
        </div>
      </div>
      {body}
      <PersonSheet
        person={open}
        selected={!!open && selected.has(open.pubkey)}
        onToggle={() => open && onToggle(open.pubkey)}
        onClose={() => setOpen(undefined)}
      />
    </section>
  );
}

/** Fade a section up the first time it scrolls into view. */
function useReveal<T extends Element>() {
  const [seen, setSeen] = useState(false);
  const [node, ref] = useState<T | null>(null);
  useEffect(() => {
    if (!node || seen || typeof IntersectionObserver === 'undefined') {
      if (!seen && typeof IntersectionObserver === 'undefined') setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setSeen(true);
        observer.disconnect();
      }
    }, { rootMargin: '0px 0px -10% 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, seen]);
  return { ref, seen };
}

function PreviewArt({ preview, audio, onBroken }: { preview: WelcomePreview; audio: TrackPreview; onBroken: () => void }) {
  switch (preview.type) {
    case 'themes': return <PhoneArt works={preview.works} />;
    case 'photos': return <PhotoTile work={preview.works[0]} onBroken={onBroken} />;
    case 'game': return <GameArt game={preview.works[0]} />;
    case 'track': return <VinylArt work={preview.works[0]} audio={audio} />;
    case 'cover': return <CoverTile work={preview.works[0]} />;
    case 'ditto': return <DittoTile works={preview.works} />;
    case 'talk': return <TalkTile work={preview.works[0]} />;
  }
}

function previewSubtitle(preview: WelcomePreview): ReactNode {
  switch (preview.type) {
    case 'themes': return preview.works[0].theme.title;
    case 'game': return preview.works.map((g) => g.name).join(' · ');
    case 'track': return preview.works[0].track.title;
    case 'cover': return preview.works[0].title;
    case 'ditto': return <DittoCaption thing={preview.works[0]} />;
    default: return null;
  }
}

type CardVariant = 'card' | 'lead' | 'compact';

/**
 * The work, then who made it and a follow toggle. Tapping the work or the
 * name opens a closer look. A lead card adds their bio line; a compact card
 * drops the label and puts follow on the art as a round button.
 */
function PersonCard({ pubkey, variant = 'card', className, renderArt, subtitle, selected, onToggle, onOpen }: {
  pubkey: string;
  variant?: CardVariant;
  className?: string;
  /** The preview. If its media can't load, the section drops this person. */
  renderArt: () => ReactNode;
  subtitle: ReactNode;
  selected: boolean;
  onToggle: () => void;
  /** Show a closer look at this person. */
  onOpen: () => void;
}) {
  const intl = useIntl();
  const { data } = useAuthor(pubkey);
  const metadata = data?.metadata;
  const name = profileName(metadata) ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  const compact = variant === 'compact';
  const lead = variant === 'lead';
  const about = lead ? metadata?.about?.split('\n').find((l) => l.trim()) : undefined;

  return (
    <div className={cn('shrink-0', className)}>
      <div className="relative cursor-pointer" onClick={onOpen}>
        {renderArt()}
        {compact && <FollowToggle selected={selected} onToggle={onToggle} iconOnly className="absolute right-1.5 top-1.5" />}
      </div>
      <button
        type="button"
        onClick={onOpen}
        className={cn('flex w-full min-w-0 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', compact ? 'mt-1.5' : 'mt-3')}
      >
        <Avatar className={cn('shrink-0', compact ? 'size-5' : lead ? 'size-9' : 'size-7')} shape={getAvatarShape(metadata)}>
          <AvatarImage src={metadata?.picture} imeta={data?.imeta?.picture} alt="" />
          <AvatarFallback className="bg-primary/15 text-xs text-primary">{name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="min-w-0">
          <span className={cn('block truncate font-medium leading-tight', compact ? 'text-xs' : lead ? 'text-base font-semibold' : 'text-sm')}>{name}</span>
          {!compact && subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
        </span>
      </button>
      {about && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{about}</p>}
      {!compact && <FollowToggle selected={selected} onToggle={onToggle} className={cn('mt-2', lead ? 'w-auto px-5' : 'w-full')} />}
    </div>
  );
}

function FollowToggle({ selected, onToggle, iconOnly, className }: { selected: boolean; onToggle: () => void; iconOnly?: boolean; className?: string }) {
  const intl = useIntl();
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={iconOnly ? intl.formatMessage({ id: 'onboarding.people.pick', defaultMessage: 'Follow' }) : undefined}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={cn(
        'flex items-center justify-center gap-1 rounded-full text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        iconOnly ? 'size-8' : 'h-8',
        selected ? 'bg-primary text-primary-foreground' : iconOnly ? 'bg-background text-foreground hover:bg-secondary' : 'bg-secondary hover:bg-secondary/70',
        className,
      )}
    >
      {selected ? <Check className="size-3.5" strokeWidth={3} /> : <Plus className="size-3.5" strokeWidth={3} />}
      {!iconOnly && (selected
        ? <FormattedMessage id="onboarding.people.picked" defaultMessage="Following" />
        : <FormattedMessage id="onboarding.people.pick" defaultMessage="Follow" />)}
    </button>
  );
}

/**
 * An article as a blog front shows it: the lead with its cover across the top,
 * the rest as headlines with a thumbnail. Byline and follow underneath.
 */
function Headline({ person, lead, selected, onToggle, onOpen }: {
  person: WelcomePerson;
  lead?: boolean;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const intl = useIntl();
  const { data } = useAuthor(person.pubkey);
  const metadata = data?.metadata;
  const name = profileName(metadata) ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  const [failed, setFailed] = useState(false);
  const [reading, setReading] = useState(false);
  if (person.preview.type !== 'cover') return null;
  const article = person.preview.works[0];
  const image = failed ? undefined : article.image;
  const readingTime = formatReadingTime(article.event.content, intl);
  const read = () => setReading(true);

  const readButton = (
    <Button size="sm" variant="secondary" className="h-7 gap-1 rounded-full px-3 text-xs" onClick={read}>
      <BookOpen className="size-3.5" />
      {readingTime ?? <FormattedMessage id="onboarding.people.read" defaultMessage="Read" />}
    </Button>
  );
  const sheet = (
    <ArticleSheet event={article.event} open={reading} onClose={() => setReading(false)} selected={selected} onToggle={onToggle} />
  );

  const byline = (
    <div className="mt-2 flex items-center gap-2">
      <Avatar className="size-5 shrink-0" shape={getAvatarShape(metadata)}>
        <AvatarImage src={metadata?.picture} imeta={data?.imeta?.picture} alt="" />
        <AvatarFallback className="bg-primary/15 text-[10px] text-primary">{name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <button type="button" onClick={onOpen} className="min-w-0 truncate text-xs text-muted-foreground hover:text-foreground">{name}</button>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        {readButton}
        <FollowToggle selected={selected} onToggle={onToggle} className="h-7 w-auto px-3" />
      </div>
    </div>
  );

  if (lead) {
    return (
      <article className="pb-3">
        <button type="button" onClick={read} className="block w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {image && (
            <div className="relative mb-3 aspect-[16/9] overflow-hidden rounded-2xl border border-border-subtle bg-secondary">
              <TileImage src={image} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
            </div>
          )}
          <h4 className="text-xl font-bold leading-tight tracking-tight">{article.title}</h4>
          {article.summary && <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{article.summary}</p>}
        </button>
        {byline}
        {sheet}
      </article>
    );
  }

  return (
    <article className="py-3">
      <button type="button" onClick={read} className="flex w-full items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="min-w-0 flex-1">
          <h4 className="line-clamp-2 font-semibold leading-snug">{article.title}</h4>
          {article.summary && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{article.summary}</p>}
        </span>
        {image && (
          <span className="relative size-20 shrink-0 overflow-hidden rounded-xl border border-border-subtle bg-secondary">
            <TileImage src={image} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
          </span>
        )}
      </button>
      {byline}
      {sheet}
    </article>
  );
}

/** The whole article, rendered as Ditto renders it, with its author and a follow toggle on top. */
function ArticleSheet({ event, open, onClose, selected, onToggle }: {
  event: NostrEvent;
  open: boolean;
  onClose: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const intl = useIntl();
  const { data } = useAuthor(event.pubkey);
  const metadata = data?.metadata;
  const name = profileName(metadata) ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  return (
    <AdaptiveDialog open={open} onOpenChange={(o) => !o && onClose()}>
      <AdaptiveDialogContent className="flex h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden p-0" sheetClassName="overflow-hidden">
        <RouterIsland>
          {/* Leaves room for the dialog's close button on wide screens. */}
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3 sidebar:pr-12">
            <Avatar className="size-8 shrink-0" shape={getAvatarShape(metadata)}>
              <AvatarImage src={metadata?.picture} imeta={data?.imeta?.picture} alt="" />
              <AvatarFallback className="bg-primary/15 text-xs text-primary">{name[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <AdaptiveDialogTitle className="min-w-0 flex-1 truncate text-sm font-semibold">{name}</AdaptiveDialogTitle>
            <AdaptiveDialogDescription className="sr-only">{event.tags.find(([n]) => n === 'title')?.[1]}</AdaptiveDialogDescription>
            <FollowToggle selected={selected} onToggle={onToggle} className="h-8 w-auto px-4" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-10">
            {open && <ArticleContent event={event} className="mt-3" />}
          </div>
        </RouterIsland>
      </AdaptiveDialogContent>
    </AdaptiveDialog>
  );
}

/** A tight row for people whose work is words: who they are, what they wrote, follow. */
function PersonRow({ person, audio, selected, onToggle, onOpen }: {
  person: WelcomePerson;
  audio: TrackPreview;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const intl = useIntl();
  const { data } = useAuthor(person.pubkey);
  const metadata = data?.metadata;
  const name = profileName(metadata) ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });
  const { preview } = person;
  const words = preview.type === 'talk' ? preview.works[0].text : undefined;

  return (
    <div className="flex items-start gap-3 py-3">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
        {words ? (
          <Avatar className="size-10 shrink-0" shape={getAvatarShape(metadata)}>
            <AvatarImage src={metadata?.picture} imeta={data?.imeta?.picture} alt="" />
            <AvatarFallback className="bg-primary/15 text-primary">{name[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
        ) : (
          <div className="w-16 shrink-0">
            {preview.type === 'cover'
              ? <CoverThumb work={preview.works[0]} />
              : <PreviewArt preview={preview} audio={audio} onBroken={() => {}} />}
          </div>
        )}
        <span className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            {!words && (
              <Avatar className="size-5 shrink-0" shape={getAvatarShape(metadata)}>
                <AvatarImage src={metadata?.picture} imeta={data?.imeta?.picture} alt="" />
                <AvatarFallback className="bg-primary/15 text-[10px] text-primary">{name[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            )}
            <span className="truncate text-sm font-semibold">{name}</span>
          </span>
          <span className={cn('mt-0.5 block text-sm text-muted-foreground', words ? 'line-clamp-3 font-mono text-[13px] leading-snug' : 'line-clamp-2')}>
            {words ?? previewSubtitle(preview)}
          </span>
        </span>
      </button>
      <FollowToggle selected={selected} onToggle={onToggle} className="w-auto shrink-0 px-3" />
    </div>
  );
}

/**
 * A closer look at someone, over the page: banner, bio, and their actual
 * feed, rendered with the app's own post cards. The follow toggle is the same
 * one as on their card.
 */
function PersonSheet({ person, selected, onToggle, onClose }: {
  person?: WelcomePerson;
  selected: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  return (
    <AdaptiveDialog open={!!person} onOpenChange={(open) => !open && onClose()}>
      {person && <PersonSheetContent pubkey={person.pubkey} selected={selected} onToggle={onToggle} />}
    </AdaptiveDialog>
  );
}

/** The sheet (phones) or dialog (wide screens) itself, wearing the person's profile theme edge to edge. */
function PersonSheetContent({ pubkey, selected, onToggle }: { pubkey: string; selected: boolean; onToggle: () => void }) {
  const theme = useProfileThemeStyle(pubkey);
  return (
    <AdaptiveDialogContent
      style={theme?.style}
      data-theme-mode={theme?.mode}
      className="flex h-[85vh] max-w-xl flex-col gap-0 overflow-hidden p-0"
      sheetClassName="overflow-hidden"
    >
      <PersonSheetBody pubkey={pubkey} selected={selected} onToggle={onToggle} />
    </AdaptiveDialogContent>
  );
}

/**
 * Put back the theme the user had when this step opened: ends any preview,
 * and undoes a theme they kept from here. Only shown once something changed.
 */
function ResetThemeButton({ initial }: { initial: Pick<ReturnType<typeof useTheme>, 'theme' | 'customTheme'> }) {
  const { theme, customTheme, setTheme, applyCustomTheme } = useTheme();
  const preview = useThemePreview();
  const kept = theme !== initial.theme || JSON.stringify(customTheme) !== JSON.stringify(initial.customTheme);
  if (!preview && !kept) return null;

  return (
    <button
      type="button"
      onClick={() => {
        clearThemePreview();
        // Re-applying saves and publishes the theme, so only when one was kept.
        if (!kept) return;
        if (initial.theme === 'custom' && initial.customTheme) applyCustomTheme(initial.customTheme);
        else setTheme(initial.theme);
      }}
      className="flex items-center gap-1 text-xs font-medium text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:underline"
    >
      <RotateCcw className="size-3.5" />
      <FormattedMessage id="onboarding.people.resetTheme" defaultMessage="Reset theme" />
    </button>
  );
}

/**
 * Trying a theme on needs the bar that offers to keep or drop it. The app
 * renders one inside its router; onboarding runs outside it, so render our own.
 */
function StandaloneThemePreviewBar() {
  return useInRouterContext() ? null : <MemoryRouter><ThemePreviewBar /></MemoryRouter>;
}

/**
 * Onboarding renders outside the app's router, and post cards link and
 * navigate, so give them a throwaway router when there isn't one already.
 */
function RouterIsland({ children }: { children: ReactNode }) {
  const routed = useInRouterContext();
  // Track cards need the audio player, which the app also provides inside its router.
  const audio = useContext(AudioPlayerContext);
  const withAudio = audio ? <>{children}</> : <AudioPlayerProvider>{children}</AudioPlayerProvider>;
  return routed ? withAudio : <MemoryRouter>{withAudio}</MemoryRouter>;
}

/**
 * Their active profile theme (kind 16767) as inline styles for the sheet's own
 * surface: the theme's color variables, its background behind a wash of its
 * background color, and its font. Applied to the sheet itself, so the drag
 * handle and edges wear it too. Honors the setting that turns profile themes off.
 */
function useProfileThemeStyle(pubkey: string): { style: CSSProperties; mode: 'dark' | 'light' } | undefined {
  const { config } = useAppContext();
  const { data: theme } = useActiveProfileTheme(pubkey);
  const enabled = config.feedSettings?.showCustomProfileThemes !== false && !!theme?.colors;
  const font = enabled ? theme?.font : undefined;

  useEffect(() => {
    if (font?.family) loadFont(font.family, sanitizeUrl(font.url)).catch(() => {});
  }, [font?.family, font?.url]);

  return useMemo(() => {
    if (!enabled || !theme) return undefined;
    const vars: Record<string, string> = {};
    for (const [key, value] of Object.entries(coreToTokens(theme.colors)) as [string, string][]) {
      vars[toThemeVar(key)] = value;
    }
    const background = sanitizeUrl(theme.background?.url);
    const tiled = theme.background?.mode === 'tile';
    const style: CSSProperties = {
      ...vars,
      backgroundColor: 'hsl(var(--background))',
      color: 'hsl(var(--foreground))',
      ...(background && {
        backgroundImage: `linear-gradient(hsl(var(--background) / 0.8), hsl(var(--background) / 0.8)), url("${sanitizeCssString(background)}")`,
        backgroundSize: tiled ? 'auto' : 'cover',
        backgroundRepeat: tiled ? 'repeat' : 'no-repeat',
        backgroundPosition: 'center',
      }),
      ...(font?.family && { fontFamily: `"${sanitizeCssString(font.family)}", sans-serif` }),
    };
    return { style, mode: isDarkTheme(theme.colors.background) ? 'dark' : 'light' };
  }, [enabled, theme, font?.family]);
}

/** Someone's recent top-level posts, photos, themes, articles, games and tracks, newest first. */
function usePersonFeed(pubkey: string) {
  const { nostr } = useNostr();
  return useQuery({
    queryKey: ['welcome-person-feed', pubkey],
    queryFn: async ({ signal }) => {
      const events = await nostr.query(
        [{ kinds: [1, 20, THEME_DEFINITION_KIND, 30023, 1063, 36787, 32267, 30617, 35128], authors: [pubkey], limit: 30 }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(6000)]) },
      );
      return events
        .filter((e) => !e.tags.some(([n]) => n === 'e'))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 15);
    },
    staleTime: 5 * 60 * 1000,
  });
}

function PersonSheetBody({ pubkey, selected, onToggle }: { pubkey: string; selected: boolean; onToggle: () => void }) {
  const intl = useIntl();
  const { data } = useAuthor(pubkey);
  const { data: feed, isPending } = usePersonFeed(pubkey);
  const metadata = data?.metadata;
  const name = profileName(metadata) ?? intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });

  // Laid out like the top of a profile page: horizon banner, avatar over its
  // edge, the follow button opposite, then name, address and bio. Dressed in
  // their profile theme, as their profile page would be.
  return (
    <RouterIsland>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="planet-horizon-banner relative h-32">
          <div className="planet-horizon bg-secondary">
            <FallbackImage
              src={metadata?.banner}
              imeta={data?.imeta?.banner}
              placeholder={null}
              fadeIn
              className="relative size-full object-cover"
              decoding="async"
              fallback={<div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />}
            />
          </div>
          <svg className="planet-horizon-rim pointer-events-none" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true">
            <path d="M0 0Q50 2 100 0" fill="none" className="stroke-primary/45" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>

        <div className="border-b border-border-subtle px-4 pb-4">
          <div className="relative mb-3 -mt-12 flex items-start justify-between">
            <Avatar shape={getAvatarShape(metadata)} className="size-24 border-4 border-background">
              <AvatarImage src={metadata?.picture} imeta={data?.imeta?.picture} alt={name} />
              <AvatarFallback className="bg-primary/20 text-2xl text-primary">{name[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <Button
              className={cn('mt-14 rounded-full font-bold motion-safe:active:scale-95', selected && 'border border-border bg-transparent text-foreground')}
              variant={selected ? 'outline' : 'default'}
              onClick={onToggle}
            >
              {selected
                ? <FormattedMessage id="onboarding.people.picked" defaultMessage="Following" />
                : <FormattedMessage id="profile.follow" defaultMessage="Follow" />}
            </Button>
          </div>
          <AdaptiveDialogTitle className="truncate text-xl font-bold">{name}</AdaptiveDialogTitle>
          {metadata?.nip05 && <Nip05Badge nip05={metadata.nip05} pubkey={pubkey} className="text-sm text-muted-foreground" />}
          <AdaptiveDialogDescription className={cn('mt-2 line-clamp-4 whitespace-pre-line text-sm text-foreground', !metadata?.about && 'sr-only')}>
            {metadata?.about}
          </AdaptiveDialogDescription>
        </div>

        {isPending ? (
          <div className="space-y-6 p-6">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-40 w-full rounded-2xl" />
                </div>
              </div>
            ))}
          </div>
        ) : feed?.length ? (
          feed.map((event) => <NoteCard key={event.id} event={event} />)
        ) : (
          <p className="px-6 py-10 text-center text-sm text-muted-foreground">
            <FormattedMessage id="onboarding.people.noPosts" defaultMessage="No recent posts to show." />
          </p>
        )}
      </div>
    </RouterIsland>
  );
}

/**
 * The theme on a little phone: its background, a header and two posts in its
 * colors, its title in its font. Other themes by the same person sit as
 * swatches under the screen; tapping one switches the phone over.
 */
function PhoneArt({ works }: { works: WelcomeTheme[] }) {
  const intl = useIntl();
  const [index, setIndex] = useState(0);
  const tryOn = (i: number) => {
    const config = themeEventToConfig(works[i].event);
    if (config) startThemePreview(config);
  };
  const { theme } = works[index];

  return (
    <div>
      <ThemePhone
        colors={theme.colors}
        title={theme.title}
        font={theme.font}
        background={theme.background?.url}
        action={<FormattedMessage id="onboarding.people.tryIt" defaultMessage="Try it" />}
        onClick={() => tryOn(index)}
        ariaLabel={intl.formatMessage({ id: 'onboarding.people.tryTheme', defaultMessage: 'Try {title} on' }, { title: theme.title })}
      />
      {works.length > 1 && (
        <div className="mt-2 flex justify-center gap-1.5">
          {works.map((w, i) => {
            const t = coreToTokens(w.theme.colors);
            return (
              <button
                key={w.event.id}
                type="button"
                aria-label={w.theme.title}
                aria-pressed={i === index}
                onClick={(e) => { e.stopPropagation(); setIndex(i); tryOn(i); }}
                className={cn('size-4 rounded-full ring-offset-2 ring-offset-background transition-transform motion-safe:hover:scale-110', i === index ? 'ring-2 ring-foreground/60' : 'ring-1 ring-border')}
                style={{ background: `linear-gradient(135deg, ${hsl(t.background)} 50%, ${hsl(t.primary)} 50%)` }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * An image for a tile, cheap to scroll past. It loads only once it's near the
 * screen (rows scroll sideways, so native lazy loading would fetch the whole
 * row), prefers the event's own thumbnail, and sends anything enormous through
 * the thumbnail worker so a 60-megapixel photo isn't decoded to fill 150px.
 */
function TileImage({ src, imeta, alt = '', className, onError }: {
  src: string;
  imeta?: ImetaEntry;
  alt?: string;
  className?: string;
  onError?: () => void;
}) {
  const [near, setNode] = useNear();
  const thumbnail = imeta?.thumbnail;
  const [original, setOriginal] = useState(!thumbnail);
  const url = original ? src : thumbnail!;
  const [w, h] = (imeta?.dim ?? '').split('x').map(Number);
  const huge = original && (!w || !h || w * h > HUGE_PIXELS);

  if (!near) return <span ref={setNode} aria-hidden className={className} />;
  if (huge) return <ThumbnailImage src={url} alt={alt} className={className} onError={onError} />;
  return (
    <img
      src={url}
      alt={alt}
      decoding="async"
      className={className}
      onError={() => (original ? onError?.() : setOriginal(true))}
    />
  );
}

/** Above this many pixels, decode off the main thread at a smaller size. */
const HUGE_PIXELS = 4_000_000;

/** True once the element comes within a screen or so of view. */
function useNear(): [boolean, (node: Element | null) => void] {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined');
  const [node, setNode] = useState<Element | null>(null);
  useEffect(() => {
    if (near || !node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: '300px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [near, node]);
  return [near, setNode];
}

const TILE = 'relative aspect-square overflow-hidden rounded-xl bg-secondary';

function PhotoTile({ work, onBroken }: { work: WelcomePhoto; onBroken: () => void }) {
  return (
    <div className={TILE}>
      <TileImage src={work.image.url} imeta={work.image} alt={work.image.alt ?? ''} onError={onBroken} className="absolute inset-0 size-full object-cover" />
    </div>
  );
}

/** A cover small enough for a list row: the picture alone, the title being right beside it. */
function CoverThumb({ work }: { work: WelcomeCover }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn(TILE, 'flex items-center justify-center text-primary')}>
      {work.image && !failed
        ? <TileImage src={work.image} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
        : <BookOpen className="size-6" />}
    </div>
  );
}

/** An article or episode: its cover with the title over it, or the title alone. */
function CoverTile({ work }: { work: WelcomeCover }) {
  const [failed, setFailed] = useState(false);
  const image = failed ? undefined : work.image;
  return (
    <div className={TILE}>
      {image && <TileImage src={image} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />}
      <div className={cn('absolute inset-0 flex items-end p-3', image ? 'bg-gradient-to-t from-black/75 via-black/20 to-transparent text-white' : 'bg-primary/10')}>
        <p className="line-clamp-4 text-sm font-semibold leading-snug">{work.title}</p>
      </div>
    </div>
  );
}

const DITTO_KIND_ICONS: Record<number, LucideIcon> = {
  2256: MoonStar, 3367: Palette, 36767: Sparkles, 15683: Heart, 8211: Mail, 37516: Gem, 7516: Box,
  37381: Layers, 31124: Egg, 2473: Bird, 30030: SmilePlus,
};

/**
 * One thing they made on Ditto, shown as itself: a tarot card you can turn
 * over, their Blobbi, the bird they heard, a palette, an emoji pack, a
 * treasure, a theme. Across the row each card shows a different kind, so the
 * row reads as a taste of what you can see and do here.
 */
function DittoTile({ works }: { works: WelcomeDittoThing[] }) {
  const thing = works[0];
  switch (thing.event.kind) {
    case 2256: return <TarotShowcase event={thing.event} />;
    case 31124: return <BlobbiShowcase event={thing.event} />;
    case 2473: return <BirdShowcase event={thing.event} />;
    case 30030: return <EmojiShowcase event={thing.event} />;
    case 3367: return <ColorShowcase thing={thing} />;
    default: return <ImageShowcase thing={thing} />;
  }
}

/** The card from the middle of their latest reading, face down until tapped. */
function TarotShowcase({ event }: { event: NostrEvent }) {
  const [revealed, setRevealed] = useState(false);
  const card = useMemo(() => {
    const cards = parseCardsFromEvent(event);
    return cards?.[Math.min(1, cards.length - 1)];
  }, [event]);
  return (
    <div className="flex aspect-square items-center justify-center" onClick={(e) => e.stopPropagation()}>
      {card && (
        <div className={cn('w-[62%] motion-safe:transition-transform motion-safe:duration-500', !revealed && '-rotate-3')}>
          <TarotCard card={card} isRevealed={revealed} onCardClick={() => setRevealed(true)} />
        </div>
      )}
    </div>
  );
}

function BlobbiShowcase({ event }: { event: NostrEvent }) {
  const companion = useMemo(() => parseBlobbiEvent(event), [event]);
  return (
    <div className="flex aspect-square items-center justify-center">
      {companion ? <BlobbiStageVisual companion={companion} size="lg" lookMode="forward" className="size-full" /> : <Egg className="size-8 text-primary" />}
    </div>
  );
}

/** The bird they heard, pictured from its Wikipedia article, with its name. */
function BirdShowcase({ event }: { event: NostrEvent }) {
  const wikidataId = useMemo(() => {
    for (const [n, v] of event.tags) {
      const m = n === 'i' ? v?.match(/^https:\/\/www\.wikidata\.org\/entity\/(Q\d+)$/) : null;
      if (m) return m[1];
    }
    return null;
  }, [event]);
  const { data: entity } = useWikidataEntity(wikidataId);
  const { data: summary } = useWikipediaSummary(entity?.wikipediaTitle ?? null);
  const image = sanitizeUrl(summary?.thumbnail?.source);
  const species = summary?.title ?? event.tags.find(([n]) => n === 'alt')?.[1]?.match(/:\s*([^(]+)/)?.[1]?.trim();
  return (
    <div className={cn(TILE, 'bg-emerald-500/10')}>
      {image
        ? <TileImage src={image} className="absolute inset-0 size-full object-cover" />
        : <Bird className="absolute inset-0 m-auto size-10 text-emerald-600" />}
      {species && (
        <p className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 text-xs font-semibold text-white">{species}</p>
      )}
    </div>
  );
}

function EmojiShowcase({ event }: { event: NostrEvent }) {
  const emoji = useMemo(
    () => event.tags.filter(([n, , url]) => n === 'emoji' && sanitizeUrl(url)).slice(0, 9).map(([, code, url]) => ({ code, url: sanitizeUrl(url)! })),
    [event],
  );
  return (
    <div className="grid aspect-square grid-cols-3 place-items-center gap-1">
      {emoji.map((e) => <img key={e.code} src={e.url} alt={`:${e.code}:`} title={`:${e.code}:`} loading="lazy" decoding="async" className="size-11 object-contain" />)}
    </div>
  );
}

/** Their palette, with the moment's emoji if they gave it one. */
function ColorShowcase({ thing }: { thing: WelcomeDittoThing }) {
  const emoji = thing.event.content.trim();
  return (
    <div className={cn(TILE, 'flex')}>
      {thing.colors?.map((c, i) => <span key={i} className="flex-1" style={{ backgroundColor: c }} />)}
      {emoji && [...emoji].length <= 2 && <span className="absolute inset-0 m-auto size-fit text-4xl drop-shadow">{emoji}</span>}
    </div>
  );
}

function ImageShowcase({ thing }: { thing: WelcomeDittoThing }) {
  const [failed, setFailed] = useState(false);
  const intl = useIntl();
  const Icon = DITTO_KIND_ICONS[thing.event.kind] ?? Sparkles;
  if (thing.event.kind === THEME_DEFINITION_KIND && thing.image && !failed) {
    const title = thing.event.tags.find(([n]) => n === 'title')?.[1] ?? '';
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          const config = themeEventToConfig(thing.event);
          if (config) startThemePreview(config);
        }}
        aria-label={intl.formatMessage({ id: 'onboarding.people.tryTheme', defaultMessage: 'Try {title} on' }, { title })}
        className={cn(TILE, 'block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring')}
      >
        <TileImage src={thing.image} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
        <span className="absolute bottom-2 left-1/2 flex h-6 -translate-x-1/2 items-center whitespace-nowrap rounded-full bg-background px-3 text-[11px] font-semibold leading-none text-foreground" style={{ fontFamily: 'Inter Variable, Inter, system-ui, sans-serif' }}>
          <FormattedMessage id="onboarding.people.tryIt" defaultMessage="Try it" />
        </span>
      </button>
    );
  }
  if (thing.image && !failed) {
    return (
      <div className={TILE}>
        <TileImage src={thing.image} onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      </div>
    );
  }
  return (
    <div className={cn(TILE, 'flex items-center justify-center', thing.event.kind === 15683 ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary')}>
      <Icon className="size-10" />
    </div>
  );
}

/** What they did, in the words Ditto's feed uses for it. */
function DittoCaption({ thing }: { thing: WelcomeDittoThing }) {
  const text = useTarotText();
  const { event } = thing;
  if (event.kind === 2256) {
    const cards = parseCardsFromEvent(event);
    const card = cards?.[Math.min(1, cards.length - 1)];
    return card
      ? <FormattedMessage id="onboarding.people.did.tarotCard" defaultMessage="pulled {card}" values={{ card: tarotCardName(text, card) }} />
      : <FormattedMessage id="onboarding.people.did.tarot" defaultMessage="pulled a tarot card" />;
  }
  const label = DITTO_DID[event.kind];
  return label ? <FormattedMessage {...label} /> : null;
}

const DITTO_DID: Record<number, MessageDescriptor> = {
  31124: defineMessage({ id: 'onboarding.people.did.blobbi', defaultMessage: 'is raising a Blobbi' }),
  2473: defineMessage({ id: 'onboarding.people.did.bird', defaultMessage: 'heard a bird' }),
  30030: defineMessage({ id: 'onboarding.people.did.emoji', defaultMessage: 'made an emoji pack' }),
  3367: defineMessage({ id: 'onboarding.people.did.colors', defaultMessage: 'shared a color moment' }),
  37516: defineMessage({ id: 'onboarding.people.did.hidTreasure', defaultMessage: 'hid a treasure' }),
  7516: defineMessage({ id: 'onboarding.people.did.foundTreasure', defaultMessage: 'found a treasure' }),
  36767: defineMessage({ id: 'onboarding.people.did.theme', defaultMessage: 'made a theme' }),
  37381: defineMessage({ id: 'onboarding.people.did.deck', defaultMessage: 'built a deck' }),
  15683: defineMessage({ id: 'onboarding.people.did.loveList', defaultMessage: 'wrote a Love List' }),
};

/** Something they said, set like a terminal. */
function TalkTile({ work }: { work: WelcomeTalk }) {
  return (
    <div className={cn(TILE, 'bg-neutral-900 p-3 text-neutral-100')}>
      <div className="mb-2 flex gap-1" aria-hidden>
        <span className="size-2 rounded-full bg-red-400/80" />
        <span className="size-2 rounded-full bg-amber-300/80" />
        <span className="size-2 rounded-full bg-emerald-400/80" />
      </div>
      <p className="line-clamp-6 whitespace-pre-line font-mono text-[11px] leading-snug">{work.text}</p>
    </div>
  );
}

/** The game's cartridge. Tapping it starts the game over this screen. */
function GameArt({ game }: { game: WelcomeGame }) {
  return (
    <div className="flex aspect-square items-center justify-center" onClick={(e) => e.stopPropagation()}>
      <WebxdcEmbed url={game.url} uuid={game.uuid} name={game.name} icon={game.icon} showNameCard={false} className="mt-0 w-[92%]" />
    </div>
  );
}

/** A record with the artwork as its label. It spins while the track plays. */
function VinylArt({ work, audio }: { work: WelcomeTrack; audio: TrackPreview }) {
  const intl = useIntl();
  const playing = audio.playing === work.event.id;
  return (
    <div className="relative aspect-square">
      <div
        className={cn('absolute inset-0 rounded-full shadow-md', playing && 'motion-safe:animate-[spin_4s_linear_infinite]')}
        style={{ background: 'conic-gradient(from 30deg, rgba(255,255,255,0.10), transparent 15%, transparent 50%, rgba(255,255,255,0.08) 60%, transparent 75%), repeating-radial-gradient(circle, #121212 0 2px, #1d1d1d 2px 4px)' }}
      >
        <div className="absolute inset-[30%] overflow-hidden rounded-full ring-2 ring-black/40">
          {work.track.artwork && <TileImage src={work.track.artwork} className="absolute inset-0 size-full object-cover" />}
          <span className="absolute left-1/2 top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-100 ring-1 ring-black/30" />
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); if (playing) audio.stop(); else audio.play(work.event.id, work.track.url); }}
        aria-label={playing
          ? intl.formatMessage({ id: 'onboarding.people.pause', defaultMessage: 'Pause' })
          : intl.formatMessage({ id: 'onboarding.people.play', defaultMessage: 'Play {title}' }, { title: work.track.title })}
        className={cn(
          'absolute bottom-0 right-0 flex size-10 items-center justify-center rounded-full shadow-md transition-transform motion-safe:hover:scale-105',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          playing ? 'bg-primary text-primary-foreground' : 'bg-white text-black',
        )}
      >
        {playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
      </button>
    </div>
  );
}

interface TrackPreview {
  playing?: string;
  play: (id: string, url: string) => void;
  stop: () => void;
}

/**
 * A single shared <audio> for previews. Onboarding renders outside the app's
 * audio player (and router), so tracks play here directly, one at a time,
 * and stop when the step is left.
 */
function useTrackPreview(): TrackPreview {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string>();

  const stop = useCallback(() => {
    ref.current?.pause();
    setPlaying(undefined);
  }, []);

  const play = useCallback((id: string, url: string) => {
    ref.current ??= new Audio();
    const el = ref.current;
    el.src = url;
    el.onended = () => setPlaying(undefined);
    el.play().then(() => setPlaying(id)).catch(() => setPlaying(undefined));
  }, []);

  useEffect(() => () => ref.current?.pause(), []);

  return useMemo(() => ({ playing, play, stop }), [playing, play, stop]);
}

/**
 * Loading state in the shape of what arrives: the first sections' real
 * headers over placeholders laid out as they will be (a row of cards, a row
 * of theme phones, a lead story, a list), so nothing jumps when it fills in.
 */
function PeopleSkeleton() {
  const header = (Icon: LucideIcon, label: MessageDescriptor) => (
    <div className="flex items-center justify-between px-6 pt-6 pb-3">
      <h3 className="flex items-center gap-2 text-base font-semibold text-muted-foreground">
        <Icon className="size-5 shrink-0" />
        <FormattedMessage {...label} />
      </h3>
      <Skeleton className="h-3 w-16" />
    </div>
  );
  const byline = (
    <div className="mt-3 flex items-center gap-2">
      <Skeleton className="size-7 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );

  return (
    <div aria-busy="true">
      {header(Orbit, SKELETON_LABELS.regulars)}
      <div className="flex gap-4 overflow-hidden px-6 pt-1 pb-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[148px] shrink-0">
            <Skeleton className="aspect-square rounded-xl" />
            {byline}
            <Skeleton className="mt-2 h-8 rounded-full" />
          </div>
        ))}
      </div>

      {header(Sparkles, SKELETON_LABELS.themes)}
      <div className="flex gap-4 overflow-hidden px-6 pt-1 pb-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="w-[112px] shrink-0">
            <Skeleton className="aspect-[9/16] rounded-[22px]" />
            {byline}
          </div>
        ))}
      </div>

      {header(Leaf, SKELETON_LABELS.nature)}
      <div className="grid grid-cols-3 gap-3 px-6 pb-4">
        <div className="col-span-2">
          <Skeleton className="aspect-square rounded-xl" />
          {byline}
          <Skeleton className="mt-2 h-3 w-5/6" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="aspect-square rounded-xl" />
          <Skeleton className="aspect-square rounded-xl" />
        </div>
      </div>

      {header(Hammer, SKELETON_LABELS.builders)}
      <div className="divide-y divide-border-subtle px-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-start gap-3 py-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
            <Skeleton className="h-8 w-20 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors the section labels in useWelcomePeople, for headers shown while loading. */
const SKELETON_LABELS = {
  regulars: defineMessage({ id: 'onboarding.people.regulars', defaultMessage: 'Ditto regulars' }),
  themes: defineMessage({ id: 'onboarding.people.themes', defaultMessage: 'Theme makers' }),
  nature: defineMessage({ id: 'onboarding.people.photos', defaultMessage: 'Out in nature' }),
  builders: defineMessage({ id: 'onboarding.people.builders', defaultMessage: 'Builders' }),
};
