/**
 * PhotoBottomBar — author info + reaction strip rendered at the bottom of
 * the media Lightbox. Sits flush with the device's safe-area edge; no extra
 * clearance is needed because the Lightbox is a fixed full-screen overlay
 * that covers the bottom navigation bar entirely.
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle, Zap, MoreHorizontal } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ReactionButton } from '@/components/ReactionButton';
import { RepostMenu } from '@/components/RepostMenu';
import { ZapDialog } from '@/components/ZapDialog';
import { NoteMoreMenu } from '@/components/NoteMoreMenu';
import { CommentsSheet } from '@/components/CommentsSheet';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { ProfileHoverCard } from '@/components/ProfileHoverCard';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAuthor } from '@/hooks/useAuthor';
import { useProfileUrl } from '@/hooks/useProfileUrl';
import { useEventStats } from '@/hooks/useTrending';
import { getDisplayName } from '@/lib/getDisplayName';
import { genUserName } from '@/lib/genUserName';
import { canZap } from '@/lib/canZap';

function formatSats(sats: number): string {
  if (sats >= 1_000_000) return `${(sats / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (sats >= 1_000) return `${(sats / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return sats.toString();
}

interface PhotoBottomBarProps {
  event: NostrEvent;
  onCommentClick: () => void;
  /** The event currently open in CommentsSheet (managed by the parent). */
  commentsEvent?: NostrEvent | null;
  /** Called when CommentsSheet wants to close. */
  onCommentsClose?: () => void;
}

export function PhotoBottomBar({ event, onCommentClick, commentsEvent, onCommentsClose }: PhotoBottomBarProps) {
  const { user } = useCurrentUser();
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey) ?? genUserName(event.pubkey);
  const profileUrl = useProfileUrl(event.pubkey, metadata);
  const { data: stats } = useEventStats(event.id);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const canZapAuthor = user && canZap(metadata);

  return (
    <>
      {/* Action strip — mirrors top bar: px-4 py-3 + safe-area */}
      <div className="relative safe-area-bottom">
        {/* Gradient scrim: tall enough to fade nicely over the image above the bar */}
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />

        <div className="relative flex items-center gap-1 px-4 py-3 max-w-xl mx-auto">
          {/* Avatar + name */}
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="shrink-0">
              <Avatar className="size-7">
                <AvatarImage src={metadata?.picture} alt={displayName} />
                <AvatarFallback className="bg-white/20 text-white text-xs">
                  {displayName[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </Link>
          </ProfileHoverCard>
          <ProfileHoverCard pubkey={event.pubkey} asChild>
            <Link to={profileUrl} className="font-semibold text-sm text-white hover:underline truncate mr-1">
              {displayName}
            </Link>
          </ProfileHoverCard>

          {/* Actions — p-2.5 on each button matches the top bar button padding */}
          <div className="flex items-center ml-auto shrink-0">
            <ReactionButton
              eventId={event.id}
              eventPubkey={event.pubkey}
              eventKind={event.kind}
              reactionCount={stats?.reactions}
              filledHeart
              className="text-white hover:text-pink-400 hover:bg-white/10 p-2.5 [&_svg]:size-5"
            />

            <button
              className="flex items-center gap-1 p-2.5 text-white hover:text-blue-400 transition-colors"
              onClick={onCommentClick}
            >
              <MessageCircle className="size-5" />
              {!!stats?.replies && <span className="text-sm tabular-nums drop-shadow">{stats.replies}</span>}
            </button>

            <RepostMenu event={event}>
              {(isReposted: boolean) => (
                <button className={`flex items-center gap-1 p-2.5 transition-colors ${isReposted ? 'text-accent' : 'text-white hover:text-accent'}`}>
                  <RepostIcon className="size-5" />
                  {!!((stats?.reposts ?? 0) + (stats?.quotes ?? 0)) && (
                    <span className="text-sm tabular-nums drop-shadow">{(stats?.reposts ?? 0) + (stats?.quotes ?? 0)}</span>
                  )}
                </button>
              )}
            </RepostMenu>

            {canZapAuthor && (
              <ZapDialog target={event}>
                <button className="flex items-center gap-1 p-2.5 text-white hover:text-amber-400 transition-colors">
                  <Zap className="size-5" />
                  {!!stats?.zapAmount && <span className="text-sm tabular-nums drop-shadow">{formatSats(stats.zapAmount)}</span>}
                </button>
              </ZapDialog>
            )}

            <button
              className="p-2.5 text-white/70 hover:text-white transition-colors"
              onClick={() => setMoreMenuOpen(true)}
            >
              <MoreHorizontal className="size-5" />
            </button>
          </div>
        </div>
      </div>

      <NoteMoreMenu event={event} open={moreMenuOpen} onOpenChange={setMoreMenuOpen} />

      {/* CommentsSheet is rendered here so it sits inside the fixed overlay stacking context */}
      <CommentsSheet
        event={commentsEvent ?? undefined}
        open={!!commentsEvent}
        onClose={onCommentsClose ?? (() => {})}
      />
    </>
  );
}
