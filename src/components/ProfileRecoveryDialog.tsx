import { profileName } from '@/lib/getDisplayName';
import { useState, useMemo } from 'react';
import { useNostr } from '@nostrify/react';
import { defineMessage, FormattedMessage, useIntl, type MessageDescriptor } from 'react-intl';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import type { NostrEvent, NostrFilter, NostrMetadata } from '@nostrify/nostrify';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { parseProfileImeta } from '@/lib/profileImeta';
import { PeopleAvatarStack } from '@/components/PeopleAvatarStack';
import {
  VersionHistoryBody,
  VersionHistoryDialog,
  VersionList,
  VersionListEmpty,
  VersionListSkeleton,
  VersionRow,
} from '@/components/VersionHistory';
import { collapseVersions, formatVersionDate, queryAllVersions, stableStringify, versionKey } from '@/lib/versionHistory';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { ACTIVE_THEME_KIND, parseActiveProfileTheme } from '@/lib/themeEvent';
import { coreToTokens } from '@/themes';
import { User, Users, Palette } from 'lucide-react';

export type ProfileRecoveryTab = 'profile' | 'follows' | 'theme';

interface ProfileRecoveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tab shown when the dialog opens. */
  defaultTab?: ProfileRecoveryTab;
}

/** Parse kind 0 content into NostrMetadata, returning undefined on failure. */
function parseMetadata(content: string): NostrMetadata | undefined {
  try {
    return JSON.parse(content) as NostrMetadata;
  } catch {
    return undefined;
  }
}

/** Extracts HSL color string for inline styles. */
function hsl(value: string): string {
  return `hsl(${value})`;
}

// ─── Row Summaries ────────────────────────────────────────────────────

function ProfileSummary({ event }: { event: NostrEvent }) {
  const intl = useIntl();
  const metadata = useMemo(() => parseMetadata(event.content), [event.content]);
  const displayName = profileName(metadata) || intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });

  return (
    <>
      <p className="truncate text-sm font-semibold">{displayName}</p>
      {metadata?.nip05 && <p className="truncate text-xs text-muted-foreground">{metadata.nip05}</p>}
      {metadata?.about && <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{metadata.about}</p>}
    </>
  );
}

function ProfileAvatar({ event }: { event: NostrEvent }) {
  const intl = useIntl();
  const metadata = useMemo(() => parseMetadata(event.content), [event.content]);
  const displayName = profileName(metadata) || intl.formatMessage({ id: 'common.anonymous', defaultMessage: 'Anonymous' });

  return (
    <Avatar shape={getAvatarShape(metadata)} className="size-11 shrink-0 self-start">
      {metadata?.picture ? (
        <AvatarImage src={metadata.picture} imeta={parseProfileImeta(event.tags, metadata)?.picture} alt={displayName} />
      ) : null}
      <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
        {displayName[0]?.toUpperCase()}
      </AvatarFallback>
    </Avatar>
  );
}

function FollowsSummary({ event }: { event: NostrEvent }) {
  // Reverse so newest follows (appended to the end of the tag list) appear first.
  const followedPubkeys = useMemo(
    () =>
      event.tags
        .filter(([name, value]) => name === 'p' && typeof value === 'string' && /^[0-9a-f]{64}$/.test(value))
        .map(([, value]) => value)
        .reverse(),
    [event.tags],
  );

  if (followedPubkeys.length === 0) {
    return (
      <p className="text-sm font-semibold text-muted-foreground">
        <FormattedMessage id="profileRecovery.noFollows" defaultMessage="No follows" />
      </p>
    );
  }

  return (
    <>
      <p className="text-sm font-semibold">
        <FormattedMessage
          id="profileRecovery.followCount"
          defaultMessage="{count, plural, one {# follow} other {# follows}}"
          values={{ count: followedPubkeys.length }}
        />
      </p>
      <PeopleAvatarStack pubkeys={followedPubkeys} maxVisible={6} size="sm" />
    </>
  );
}

/** A small swatch of the theme: its background, a line of text, and its accent. */
function ThemeSwatch({ event }: { event: NostrEvent }) {
  const parsed = useMemo(() => parseActiveProfileTheme(event), [event]);
  const tokens = useMemo(() => (parsed ? coreToTokens(parsed.colors) : null), [parsed]);
  if (!parsed || !tokens) return null;

  return (
    <div
      className="relative size-11 shrink-0 overflow-hidden rounded-xl"
      style={{ backgroundColor: hsl(tokens.background) }}
      aria-hidden
    >
      {parsed.background?.url && (
        <img src={parsed.background.url} alt="" className="absolute inset-0 size-full object-cover opacity-40" decoding="async" />
      )}
      <div className="relative flex h-full flex-col justify-center gap-1 px-2">
        <div className="h-1.5 w-full rounded-full" style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.6 }} />
        <div className="h-1.5 w-2/3 rounded-full" style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.45 }} />
        <div className="h-2.5 w-1/2 rounded-full" style={{ backgroundColor: hsl(tokens.primary) }} />
      </div>
    </div>
  );
}

function ThemeSummary({ event }: { event: NostrEvent }) {
  const title = event.tags.find(([n]) => n === 'title')?.[1];

  return (
    <p className="truncate text-sm font-semibold">
      {title ?? <FormattedMessage id="profileRecovery.themeFallbackTitle" defaultMessage="Profile Theme" />}
    </p>
  );
}

// ─── Version Keys ─────────────────────────────────────────────────────

/** Profiles match on their fields, whatever order the JSON lists them in. */
function profileKey(event: NostrEvent): string {
  const metadata = parseMetadata(event.content);
  return metadata ? stableStringify(metadata) : event.content;
}

/** Follow lists match on who and what they follow; content is a deprecated relay list. */
function followsKey(event: NostrEvent): string {
  return versionKey(event, { unorderedTags: true, ignoreContent: true });
}

function themeKey(event: NostrEvent): string {
  return versionKey(event);
}

// ─── History Tab ──────────────────────────────────────────────────────

interface HistoryTabProps {
  kind: number;
  /** Drops versions this tab can't show. */
  accept?: (event: NostrEvent) => boolean;
  /** What makes two versions the same; identical ones show as one row. */
  keyOf: (event: NostrEvent) => string | undefined;
  /** Queries holding the live copy, refreshed after a restore. */
  invalidate: (pubkey: string) => QueryKey[];
  restoredTitle: MessageDescriptor;
  empty: MessageDescriptor;
  leading?: (event: NostrEvent) => React.ReactNode;
  summary: (event: NostrEvent) => React.ReactNode;
  onClose: () => void;
}

function HistoryTab({ kind, accept, keyOf, invalidate, restoredTitle, empty, leading, summary, onClose }: HistoryTabProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const intl = useIntl();
  const queryClient = useQueryClient();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const pubkey = user?.pubkey;
  const queryKey = ['profile-recovery', `kind${kind}`, pubkey];

  const history = useQuery<NostrEvent[]>({
    queryKey,
    queryFn: async () => {
      if (!pubkey) return [];
      const filter: NostrFilter = { kinds: [kind], authors: [pubkey] };
      const events = await queryAllVersions(nostr, [filter], AbortSignal.timeout(10000));
      return accept ? events.filter(accept) : events;
    },
    enabled: !!pubkey,
    staleTime: 30_000,
  });

  const events = history.data ?? [];
  const currentId = events[0]?.id;
  const versions = useMemo(() => collapseVersions(history.data ?? [], keyOf), [history.data, keyOf]);

  const handleRestore = async (event: NostrEvent) => {
    if (!pubkey) return;
    setRestoringId(event.id);
    try {
      await publishEvent({
        kind: event.kind,
        content: event.content,
        tags: event.tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      toast({
        title: intl.formatMessage(restoredTitle),
        description: intl.formatMessage(
          { id: 'profileRecovery.restoredFrom', defaultMessage: 'Successfully restored from {date}.' },
          { date: formatVersionDate(event.created_at, intl) },
        ),
      });

      queryClient.invalidateQueries({ queryKey });
      for (const key of invalidate(pubkey)) queryClient.invalidateQueries({ queryKey: key });

      onClose();
    } catch (error) {
      console.error('Failed to restore event:', error);
      toast({
        title: intl.formatMessage({ id: 'profileRecovery.restoreFailed', defaultMessage: 'Restore failed' }),
        description: intl.formatMessage({
          id: 'profileRecovery.restoreFailedDescription',
          defaultMessage: 'Could not republish the event. Please try again.',
        }),
        variant: 'destructive',
      });
    } finally {
      setRestoringId(null);
    }
  };

  if (history.isLoading) {
    return <VersionListSkeleton />;
  }

  if (events.length === 0) {
    return <VersionListEmpty><FormattedMessage {...empty} /></VersionListEmpty>;
  }

  return (
    <VersionList>
      {versions.map(({ event, copies }) => (
        <VersionRow
          key={event.id}
          event={event}
          isCurrent={event.id === currentId}
          isRestoring={restoringId === event.id}
          disabled={restoringId !== null}
          onRestore={() => handleRestore(event)}
          copies={copies}
          leading={leading?.(event)}
        >
          {summary(event)}
        </VersionRow>
      ))}
    </VersionList>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────

const messages = {
  profileRestored: defineMessage({ id: 'profileRecovery.profileRestored', defaultMessage: 'Profile restored' }),
  emptyProfile: defineMessage({ id: 'profileRecovery.emptyProfile', defaultMessage: 'No profile history found. Your relay may not store historical events.' }),
  followsRestored: defineMessage({ id: 'profileRecovery.followsRestored', defaultMessage: 'Follow list restored' }),
  emptyFollows: defineMessage({ id: 'profileRecovery.emptyFollows', defaultMessage: 'No follow list history found. Your relay may not store historical events.' }),
  themeRestored: defineMessage({ id: 'profileRecovery.themeRestored', defaultMessage: 'Theme restored' }),
  emptyTheme: defineMessage({ id: 'profileRecovery.emptyTheme', defaultMessage: 'No theme history found. Your relay may not store historical events.' }),
};

const TAB_TRIGGER_CLASS =
  'gap-1.5 rounded-full bg-secondary px-3.5 py-1.5 text-muted-foreground hover:text-foreground focus-visible:ring-offset-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-none';

export function ProfileRecoveryDialog({ open, onOpenChange, defaultTab = 'profile' }: ProfileRecoveryDialogProps) {
  const close = () => onOpenChange(false);

  return (
    <VersionHistoryDialog
      open={open}
      onOpenChange={onOpenChange}
      title={<FormattedMessage id="profileRecovery.title" defaultMessage="Profile Recovery" />}
      description={<FormattedMessage id="profileRecovery.description" defaultMessage="Pick an older version to publish again." />}
    >
      <Tabs key={defaultTab} defaultValue={defaultTab} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="h-auto shrink-0 justify-start gap-2 rounded-none bg-transparent p-0 px-5 pb-2">
          <TabsTrigger value="profile" className={TAB_TRIGGER_CLASS}>
            <User className="size-3.5" />
            <FormattedMessage id="profileRecovery.tabProfile" defaultMessage="Profile" />
          </TabsTrigger>
          <TabsTrigger value="follows" className={TAB_TRIGGER_CLASS}>
            <Users className="size-3.5" />
            <FormattedMessage id="profileRecovery.tabFollows" defaultMessage="Follows" />
          </TabsTrigger>
          <TabsTrigger value="theme" className={TAB_TRIGGER_CLASS}>
            <Palette className="size-3.5" />
            <FormattedMessage id="profileRecovery.tabTheme" defaultMessage="Theme" />
          </TabsTrigger>
        </TabsList>

        <VersionHistoryBody>
          <TabsContent value="profile" className="m-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <HistoryTab
              kind={0}
              keyOf={profileKey}
              invalidate={(pubkey) => [['author', pubkey]]}
              restoredTitle={messages.profileRestored}
              empty={messages.emptyProfile}
              leading={(event) => <ProfileAvatar event={event} />}
              summary={(event) => <ProfileSummary event={event} />}
              onClose={close}
            />
          </TabsContent>

          <TabsContent value="follows" className="m-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <HistoryTab
              kind={3}
              keyOf={followsKey}
              invalidate={() => [['follow-list']]}
              restoredTitle={messages.followsRestored}
              empty={messages.emptyFollows}
              summary={(event) => <FollowsSummary event={event} />}
              onClose={close}
            />
          </TabsContent>

          <TabsContent value="theme" className="m-0 focus-visible:ring-0 focus-visible:ring-offset-0">
            <HistoryTab
              kind={ACTIVE_THEME_KIND}
              accept={(event) => parseActiveProfileTheme(event) !== null}
              keyOf={themeKey}
              invalidate={(pubkey) => [['activeProfileTheme', pubkey]]}
              restoredTitle={messages.themeRestored}
              empty={messages.emptyTheme}
              leading={(event) => <ThemeSwatch event={event} />}
              summary={(event) => <ThemeSummary event={event} />}
              onClose={close}
            />
          </TabsContent>
        </VersionHistoryBody>
      </Tabs>
    </VersionHistoryDialog>
  );
}
