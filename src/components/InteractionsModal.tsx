import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Quote, Heart, Zap, X, ChevronRight } from 'lucide-react';
import { RepostIcon } from '@/components/icons/RepostIcon';
import { nip19 } from 'nostr-tools';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarShape } from '@/lib/avatarShape';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { CustomEmojiImg, EmojifiedText } from '@/components/CustomEmoji';
import { isCustomEmoji } from '@/lib/customEmoji';
import { useEventInteractions, type RepostEntry, type QuoteEntry, type ReactionEntry, type ZapEntry } from '@/hooks/useEventInteractions';
import { useAuthor } from '@/hooks/useAuthor';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { formatNumber } from '@/lib/formatNumber';
import { cn } from '@/lib/utils';

export type InteractionTab = 'reposts' | 'quotes' | 'reactions' | 'zaps';

interface InteractionsModalProps {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab to show initially. */
  initialTab?: InteractionTab;
}

export function InteractionsModal({ eventId, open, onOpenChange, initialTab = 'reposts' }: InteractionsModalProps) {
  const [activeTab, setActiveTab] = useState<InteractionTab>(initialTab);
  const { data, isLoading } = useEventInteractions(open ? eventId : undefined);

  // Sync active tab whenever initialTab changes (e.g. clicking a different stat while modal is already open)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  const handleOpenChange = (value: boolean) => {
    onOpenChange(value);
  };

  const repostCount = data?.reposts.length ?? 0;
  const quoteCount = data?.quotes.length ?? 0;
  const reactionCount = data?.reactions.length ?? 0;
  const zapCount = data?.zaps.length ?? 0;

  const tabConfig: { key: InteractionTab; label: string; count: number; icon: React.ReactNode }[] = [
    { key: 'reposts', label: 'Reposts', count: repostCount, icon: <RepostIcon className="size-4" /> },
    { key: 'quotes', label: 'Quotes', count: quoteCount, icon: <Quote className="size-4" /> },
    { key: 'reactions', label: 'Reactions', count: reactionCount, icon: <Heart className="size-4" /> },
    { key: 'zaps', label: 'Zaps', count: zapCount, icon: <Zap className="size-4" /> },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
       <DialogContent className="max-w-[460px] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12">
          <DialogTitle className="text-base font-semibold">Post interactions</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-border">
          {tabConfig.map(({ key, label, count, icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1 py-3 text-[13px] font-medium transition-colors relative hover:bg-secondary/40 px-1',
                activeTab === key ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {icon}
              <span className="hidden min-[400px]:inline">{label}</span>
              {count > 0 && (
                <span className={cn(
                  'text-xs tabular-nums',
                  activeTab === key ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {formatNumber(count)}
                </span>
              )}
              {activeTab === key && (
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <ScrollArea className="max-h-[60vh]">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 4 }).map((_, i) => (
                <InteractionRowSkeleton key={i} />
              ))}
            </div>
          ) : activeTab === 'reposts' ? (
            <RepostsTab reposts={data?.reposts ?? []} />
          ) : activeTab === 'quotes' ? (
            <QuotesTab quotes={data?.quotes ?? []} />
          ) : activeTab === 'reactions' ? (
            <ReactionsTab reactions={data?.reactions ?? []} />
          ) : (
            <ZapsTab zaps={data?.zaps ?? []} />
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ──── Reposts Tab ──── */
function RepostsTab({ reposts }: { reposts: RepostEntry[] }) {
  if (reposts.length === 0) {
    return <EmptyState message="No reposts yet" />;
  }

  return (
    <div className="divide-y divide-border">
      {reposts.map((repost, i) => (
        <RepostRow key={`${repost.pubkey}-${i}`} entry={repost} />
      ))}
    </div>
  );
}

/* ──── Quotes Tab ──── */
function QuotesTab({ quotes }: { quotes: QuoteEntry[] }) {
  if (quotes.length === 0) {
    return <EmptyState message="No quotes yet" />;
  }

  return (
    <div className="divide-y divide-border">
      {quotes.map((quote, i) => (
        <QuoteRow key={`${quote.pubkey}-${i}`} quote={quote} />
      ))}
    </div>
  );
}

/* ──── Reactions Tab ──── */
function ReactionsTab({ reactions }: { reactions: ReactionEntry[] }) {
  // Group reactions by emoji
  const grouped = useMemo(() => {
    const groups = new Map<string, ReactionEntry[]>();
    for (const r of reactions) {
      const key = r.emoji;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    // Sort groups by count (most popular first)
    return Array.from(groups.entries()).sort((a, b) => b[1].length - a[1].length);
  }, [reactions]);

  if (reactions.length === 0) {
    return <EmptyState message="No reactions yet" />;
  }

  return (
    <div>
      {grouped.map(([emoji, entries]) => {
        // Check if this is a custom emoji — use the URL from the first entry
        const firstEntry = entries[0];
        const customUrl = firstEntry?.emojiUrl;
        const customName = isCustomEmoji(emoji) ? emoji.slice(1, -1) : undefined;

        return (
          <div key={emoji}>
            {/* Emoji group header */}
            <div className="flex items-center gap-2 px-4 py-2 bg-secondary/30 sticky top-0 z-[1]">
              {customUrl && customName ? (
                <CustomEmojiImg name={customName} url={customUrl} className="inline-block h-6 w-6" />
              ) : (
                <span className="text-lg">{emoji}</span>
              )}
              <span className="text-xs text-muted-foreground font-medium">{entries.length}</span>
            </div>
            {/* Users who reacted with this emoji — each row links to the reaction event */}
            <div className="divide-y divide-border">
              {entries.map((entry, i) => (
                <ReactionRow key={`${entry.pubkey}-${i}`} entry={entry} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ──── Zaps Tab ──── */
function ZapsTab({ zaps }: { zaps: ZapEntry[] }) {
  if (zaps.length === 0) {
    return <EmptyState message="No zaps yet" />;
  }

  const totalSats = zaps.reduce((sum, z) => sum + z.amountSats, 0);

  return (
    <div>
      {/* Total */}
      <div className="flex items-center justify-center gap-2 px-4 py-3 bg-secondary/30 border-b border-border">
        <Zap className="size-4 text-amber-500 fill-amber-500" />
        <span className="text-sm font-bold text-amber-500">{formatNumber(totalSats)} sats</span>
        <span className="text-xs text-muted-foreground">from {zaps.length} zap{zaps.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="divide-y divide-border">
        {zaps.map((zap, i) => (
          <ZapRow key={`${zap.senderPubkey}-${i}`} zap={zap} />
        ))}
      </div>
    </div>
  );
}

/* ──── Shared Row Components ──── */

function RepostRow({ entry }: { entry: RepostEntry }) {
  const author = useAuthor(entry.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(entry.pubkey);
  const nevent = useMemo(() => nip19.neventEncode({ id: entry.eventId, author: entry.pubkey }), [entry.eventId, entry.pubkey]);

  return (
    <Link
      to={`/${nevent}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <Avatar shape={avatarShape} className="size-10 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm truncate">
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
            ) : displayName}
          </span>
          {metadata?.nip05 && (
            <VerifiedNip05Text nip05={metadata.nip05} pubkey={entry.pubkey} className="text-xs text-muted-foreground truncate" />
          )}
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function ReactionRow({ entry }: { entry: ReactionEntry }) {
  const author = useAuthor(entry.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(entry.pubkey);
  const nevent = useMemo(() => nip19.neventEncode({ id: entry.eventId, author: entry.pubkey }), [entry.eventId, entry.pubkey]);

  return (
    <Link
      to={`/${nevent}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <Avatar shape={avatarShape} className="size-10 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm truncate">
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
            ) : displayName}
          </span>
          {metadata?.nip05 && (
            <VerifiedNip05Text nip05={metadata.nip05} pubkey={entry.pubkey} className="text-xs text-muted-foreground truncate" />
          )}
        </div>
        <span className="text-xs text-muted-foreground">{timeAgo(entry.createdAt)}</span>
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}


function ZapRow({ zap }: { zap: ZapEntry }) {
  const author = useAuthor(zap.senderPubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(zap.senderPubkey);
  const nevent = useMemo(() => nip19.neventEncode({ id: zap.eventId, author: zap.senderPubkey }), [zap.eventId, zap.senderPubkey]);

  return (
    <Link
      to={`/${nevent}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <Avatar shape={avatarShape} className="size-10 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm truncate">
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
            ) : displayName}
          </span>
          {metadata?.nip05 && (
            <VerifiedNip05Text nip05={metadata.nip05} pubkey={zap.senderPubkey} className="text-xs text-muted-foreground truncate" />
          )}
        </div>
        {zap.message && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{zap.message}</p>
        )}
      </div>

      {/* Zap amount badge */}
      <div className="flex items-center gap-1 shrink-0 bg-amber-500/10 text-amber-500 rounded-full px-2.5 py-1">
        <Zap className="size-3.5 fill-amber-500" />
        <span className="text-xs font-bold tabular-nums">{formatNumber(zap.amountSats)}</span>
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function QuoteRow({ quote }: { quote: QuoteEntry }) {
  const author = useAuthor(quote.pubkey);
  const metadata = author.data?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(quote.pubkey);
  const nevent = useMemo(() => nip19.neventEncode({ id: quote.eventId, author: quote.pubkey }), [quote.eventId, quote.pubkey]);

  return (
    <Link
      to={`/${nevent}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-secondary/30 transition-colors"
    >
      <Avatar shape={avatarShape} className="size-10 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {displayName[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm truncate">
            {author.data?.event ? (
              <EmojifiedText tags={author.data.event.tags}>{displayName}</EmojifiedText>
            ) : displayName}
          </span>
          {metadata?.nip05 && (
            <VerifiedNip05Text nip05={metadata.nip05} pubkey={quote.pubkey} className="text-xs text-muted-foreground truncate" />
          )}
        </div>
        {quote.content && (
          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{quote.content}</p>
        )}
        <span className="text-xs text-muted-foreground">{timeAgo(quote.createdAt)}</span>
      </div>
    </Link>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-12 text-center text-muted-foreground text-sm">
      {message}
    </div>
  );
}

function InteractionRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="size-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}
