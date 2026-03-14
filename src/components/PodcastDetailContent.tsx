/**
 * Rich detail view for podcast episodes (kind 30054) and trailers (kind 30055).
 * Modeled after MusicDetailContent with play/pause hero, comments, and interactions.
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Podcast, Zap, Clock } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import type { NostrEvent } from '@nostrify/nostrify';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useEventStats } from '@/hooks/useTrending';

import { useComments } from '@/hooks/useComments';
import { useMuteList } from '@/hooks/useMuteList';
import { isEventMuted } from '@/lib/muteHelpers';
import { getDisplayName } from '@/lib/getDisplayName';
import { formatTime } from '@/lib/formatTime';
import { canZap } from '@/lib/canZap';
import { cn } from '@/lib/utils';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';

import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { ReplyComposeModal } from '@/components/ReplyComposeModal';
import { ZapDialog } from '@/components/ZapDialog';
import { InteractionsModal, type InteractionTab } from '@/components/InteractionsModal';
import { NoteCard } from '@/components/NoteCard';
import { useAudioPlayer } from '@/contexts/AudioPlayerContext';
import { parsePodcastEpisode, parsePodcastTrailer, episodeToAudioTrack, trailerToAudioTrack } from '@/lib/podcastHelpers';

/** Format a full date. */
function formatFullDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/** Format sats compactly. */
function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

export function PodcastDetailContent({ event }: { event: NostrEvent }) {
  const isEpisode = event.kind === 30054;
  return isEpisode ? <EpisodeDetail event={event} /> : <TrailerDetail event={event} />;
}

// ── Episode detail ────────────────────────────────────────────────────────────

function EpisodeDetail({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const player = useAudioPlayer();
  const parsed = useMemo(() => parsePodcastEpisode(event), [event]);

  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const { user } = useCurrentUser();

  const stats = useEventStats(event.id);
  const { muteItems } = useMuteList();

  const [replyOpen, setReplyOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [interactionsTab, setInteractionsTab] = useState<InteractionTab | null>(null);

  // Comments (NIP-22)
  const { data: commentsData, isLoading: commentsLoading } = useComments(event, 500);
  const comments = useMemo(() => {
    const top = commentsData?.topLevelComments ?? [];
    if (muteItems.length === 0) return top;
    return top.filter((r) => !isEventMuted(r, muteItems));
  }, [commentsData?.topLevelComments, muteItems]);

  const hashtags = event.tags.filter(([n]) => n === 't').map(([, v]) => v);

  const isNowPlaying = player.currentTrack?.id === event.id;
  const dur = parsed?.duration ? formatTime(parsed.duration) : undefined;

  const handlePlay = () => {
    if (!parsed) return;
    if (isNowPlaying && player.isPlaying) {
      player.pause();
    } else if (isNowPlaying) {
      player.resume();
    } else {
      const track = episodeToAudioTrack(event, parsed);
      track.artist = displayName;
      track.artwork ??= metadata?.picture;
      player.playTrack(track);
    }
  };

  const zapAmount = stats.data?.zapAmount ?? 0;

  return (
    <main className="">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-4">
        <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold truncate">Episode Details</h1>
      </div>

      {/* Hero: artwork + info side by side */}
      <div className="px-4 flex gap-5 items-start">
        {/* Artwork */}
        <div className="shrink-0 w-32 sm:w-40 aspect-square rounded-2xl overflow-hidden bg-muted shadow-lg">
          {parsed?.artwork ? (
            <img src={parsed.artwork} alt={parsed.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-primary/10">
              <Podcast className="size-12 text-primary/30" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2 pt-1">
          <h2 className="text-xl sm:text-2xl font-bold leading-tight">{parsed?.title ?? 'Untitled'}</h2>

          <Link to={profileUrl} className="flex items-center gap-2 group" onClick={(e) => e.stopPropagation()}>
            <Avatar shape={avatarShape} className="size-6">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{displayName}</span>
          </Link>

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {hashtags.map((tag) => (
                <Link
                  key={tag}
                  to={`/t/${encodeURIComponent(tag)}`}
                  className="text-xs px-2.5 py-1 rounded-full border border-border hover:border-primary/40 hover:bg-primary/5 transition-colors"
                >
                  {tag}
                </Link>
              ))}
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={handlePlay}
              className={cn(
                'size-11 rounded-full flex items-center justify-center transition-colors',
                isNowPlaying && player.isPlaying
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/15 text-primary hover:bg-primary/25',
              )}
              aria-label={isNowPlaying && player.isPlaying ? 'Pause' : 'Play'}
            >
              {isNowPlaying && player.isPlaying
                ? <Pause className="size-5" fill="currentColor" />
                : <Play className="size-5 ml-0.5" fill="currentColor" />}
            </button>

            <ReactionButton
              eventId={event.id}
              eventPubkey={event.pubkey}
              eventKind={event.kind}
              reactionCount={stats.data?.reactions}
            />

            <RepostMenu event={event}>
              {(isReposted: boolean) => (
                <button
                  className={cn(
                    'size-11 rounded-full flex items-center justify-center transition-colors',
                    isReposted ? 'text-accent hover:bg-accent/10' : 'bg-secondary/50 text-muted-foreground hover:bg-secondary',
                  )}
                  title="Repost"
                >
                  <RepostIcon className="size-5" />
                </button>
              )}
            </RepostMenu>

            {user && canZap(metadata) && (
              <ZapDialog target={event}>
                <button
                  className="size-11 rounded-full bg-secondary/50 text-muted-foreground hover:bg-secondary flex items-center justify-center transition-colors"
                  title="Zap"
                >
                  <Zap className="size-5" />
                </button>
              </ZapDialog>
            )}

            {/* Zap stats */}
            {zapAmount > 0 && (
              <button onClick={() => setInteractionsTab('zaps')} className="ml-1 text-right hover:opacity-80">
                <p className="text-lg font-bold leading-tight">{formatSats(zapAmount)} sats</p>
                <p className="text-xs text-muted-foreground">{stats.data?.zapCount ?? 0} zap{(stats.data?.zapCount ?? 0) !== 1 ? 's' : ''}</p>
              </button>
            )}
          </div>

          {dur && (
            <p className="text-xs text-muted-foreground flex items-center gap-1 pt-1">
              <Clock className="size-3" />{dur}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      {parsed?.description && (
        <div className="px-4 mt-4">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{parsed.description}</p>
        </div>
      )}

      {/* Date */}
      <div className="px-4 mt-3 text-xs text-muted-foreground">
        {formatFullDate(parsed?.pubdate ?? event.created_at)}
      </div>

      {/* Interactions tabs */}
      <div className="flex border-b border-border mt-4">
        <button
          onClick={() => setInteractionsTab('zaps')}
          className="flex-1 py-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          Top Zappers
        </button>
        <button
          onClick={() => setReplyOpen(true)}
          className="flex-1 py-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          Comments <span className="text-xs ml-1 opacity-70">{comments.length || 0}</span>
        </button>
        <button
          onClick={() => setInteractionsTab('reactions')}
          className="flex-1 py-3 text-center text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/40 transition-colors"
        >
          Reactions <span className="text-xs ml-1 opacity-70">{stats.data?.reactions || 0}</span>
        </button>
      </div>

      {/* Comments list */}
      {comments.length > 0 && (
        <div>
          {comments.map((comment) => (
            <NoteCard key={comment.id} event={comment} />
          ))}
        </div>
      )}

      {comments.length === 0 && !commentsLoading && (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No comments yet
        </div>
      )}

      {/* Dialogs */}
      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />
      <ReplyComposeModal event={event} open={replyOpen} onOpenChange={setReplyOpen} />
      {interactionsTab && (
        <InteractionsModal
          eventId={event.id}
          initialTab={interactionsTab}
          open={!!interactionsTab}
          onOpenChange={(open) => { if (!open) setInteractionsTab(null); }}
        />
      )}
    </main>
  );
}

// ── Trailer detail ────────────────────────────────────────────────────────────

function TrailerDetail({ event }: { event: NostrEvent }) {
  const navigate = useNavigate();
  const player = useAudioPlayer();
  const parsed = useMemo(() => parsePodcastTrailer(event), [event]);

  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = getDisplayName(metadata, event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);

  const isNowPlaying = player.currentTrack?.id === event.id;

  const handlePlay = () => {
    if (!parsed) return;
    if (isNowPlaying && player.isPlaying) {
      player.pause();
    } else if (isNowPlaying) {
      player.resume();
    } else {
      const track = trailerToAudioTrack(event, parsed);
      track.artist = displayName;
      track.artwork ??= metadata?.picture;
      player.playTrack(track);
    }
  };

  return (
    <main className="">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 mt-4 mb-4">
        <button onClick={() => window.history.length > 1 ? navigate(-1) : navigate('/')} className="p-1.5 -ml-1.5 rounded-full hover:bg-secondary/60 transition-colors">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-xl font-bold truncate">Trailer Details</h1>
      </div>

      {/* Hero */}
      <div className="px-4 flex gap-5 items-start">
        <div className="shrink-0 w-32 sm:w-40 aspect-square rounded-2xl overflow-hidden bg-muted shadow-lg">
          <div className="w-full h-full flex items-center justify-center bg-primary/10">
            <Podcast className="size-12 text-primary/30" />
          </div>
        </div>

        <div className="flex-1 min-w-0 space-y-2 pt-1">
          <h2 className="text-xl sm:text-2xl font-bold leading-tight">{parsed?.title ?? 'Untitled'}</h2>

          <Link to={profileUrl} className="flex items-center gap-2 group">
            <Avatar shape={avatarShape} className="size-6">
              <AvatarImage src={metadata?.picture} alt={displayName} />
              <AvatarFallback className="bg-primary/20 text-primary text-[10px]">{displayName[0]?.toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">{displayName}</span>
          </Link>

          {/* Play button */}
          <div className="pt-2">
            <button
              onClick={handlePlay}
              className={cn(
                'size-11 rounded-full flex items-center justify-center transition-colors',
                isNowPlaying && player.isPlaying
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-primary/15 text-primary hover:bg-primary/25',
              )}
              aria-label={isNowPlaying && player.isPlaying ? 'Pause' : 'Play'}
            >
              {isNowPlaying && player.isPlaying
                ? <Pause className="size-5" fill="currentColor" />
                : <Play className="size-5 ml-0.5" fill="currentColor" />}
            </button>
          </div>

          {parsed?.season && (
            <p className="text-xs text-muted-foreground pt-1">Season {parsed.season}</p>
          )}
        </div>
      </div>

      {/* Date */}
      <div className="px-4 mt-3 text-xs text-muted-foreground">
        {formatFullDate(event.created_at)}
      </div>
    </main>
  );
}
