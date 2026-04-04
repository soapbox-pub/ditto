import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CheckCircle2, Clock, X, ChevronRight } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useAuthor } from '@/hooks/useAuthor';
import { useAuthors } from '@/hooks/useAuthors';
import { NoteContent } from '@/components/NoteContent';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmojifiedText } from '@/components/CustomEmoji';
import { VerifiedNip05Text } from '@/components/Nip05Badge';
import { getAvatarShape } from '@/lib/avatarShape';
import { genUserName } from '@/lib/genUserName';
import { timeAgo } from '@/lib/timeAgo';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

interface PollOption {
  id: string;
  label: string;
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getOptions(tags: string[][]): PollOption[] {
  return tags
    .filter(([n]) => n === 'option')
    .map(([, id, label]) => ({ id, label }));
}

/** Deduplicate votes: keep one per pubkey (latest wins). */
function dedupeVotes(events: NostrEvent[]): NostrEvent[] {
  const map = new Map<string, NostrEvent>();
  for (const ev of events) {
    const existing = map.get(ev.pubkey);
    if (!existing || ev.created_at > existing.created_at) {
      map.set(ev.pubkey, ev);
    }
  }
  return Array.from(map.values());
}

/** Count votes per option ID from deduplicated vote events. */
function tallyVotes(
  votes: NostrEvent[],
  pollType: string,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const vote of votes) {
    const responseTags = vote.tags.filter(([n]) => n === 'response');
    if (pollType === 'singlechoice') {
      // Only first response counts
      const optionId = responseTags[0]?.[1];
      if (optionId) counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
    } else {
      // Multiplechoice: first response per option ID
      const seen = new Set<string>();
      for (const [, optionId] of responseTags) {
        if (optionId && !seen.has(optionId)) {
          seen.add(optionId);
          counts.set(optionId, (counts.get(optionId) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

/** Get voter events for a specific option ID. */
function getVotersForOption(
  votes: NostrEvent[],
  optionId: string,
  pollType: string,
): NostrEvent[] {
  return votes.filter((vote) => {
    const responseTags = vote.tags.filter(([n]) => n === 'response');
    if (pollType === 'singlechoice') {
      return responseTags[0]?.[1] === optionId;
    } else {
      return responseTags.some(([, id]) => id === optionId);
    }
  });
}

/** Clickable avatar stack + "N votes" label. */
function VoterAvatarsButton({
  votes,
  totalVotes,
  authorsMap,
  onClick,
  className,
}: {
  votes: NostrEvent[];
  totalVotes: number;
  authorsMap?: Map<string, { pubkey: string; metadata?: import('@nostrify/nostrify').NostrMetadata }>;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button onClick={onClick} className={cn('flex items-center gap-1.5 group', className)}>
      <div className="flex -space-x-1.5">
        {votes.slice(0, 6).map((vote) => {
          const authorData = authorsMap?.get(vote.pubkey);
          const metadata = authorData?.metadata;
          const avatarShape = getAvatarShape(metadata);
          const name = metadata?.name || genUserName(vote.pubkey);
          return (
            <Avatar key={vote.pubkey} shape={avatarShape} className="size-5 ring-1 ring-background">
              <AvatarImage src={metadata?.picture} alt={name} />
              <AvatarFallback className="bg-primary/20 text-primary text-[8px]">
                {name[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
          );
        })}
      </div>
      <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
      </span>
    </button>
  );
}

export function PollContent({ event }: { event: NostrEvent }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutate: publishEvent } = useNostrPublish();

  const options = useMemo(() => getOptions(event.tags), [event.tags]);
  const pollType = getTag(event.tags, 'polltype') ?? 'singlechoice';
  const endsAt = getTag(event.tags, 'endsAt');
  const isExpired = endsAt ? Number(endsAt) < Math.floor(Date.now() / 1000) : false;

  // Modal state
  const [votersModalOpen, setVotersModalOpen] = useState(false);
  const [votersModalOptionId, setVotersModalOptionId] = useState<string | null>(null);

  // Fetch vote events
  const { data: votes } = useQuery<NostrEvent[]>({
    queryKey: ['poll-votes', event.id],
    queryFn: async ({ signal }) => {
      const filter: Record<string, unknown> = {
        kinds: [1018],
        '#e': [event.id],
        limit: 200,
      };
      if (endsAt) filter.until = Number(endsAt);
      const results = await nostr.query(
        [filter as { kinds: number[]; '#e': string[]; limit: number; until?: number }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) },
      );
      return dedupeVotes(results);
    },
    staleTime: 30_000,
  });

  const tally = useMemo(() => tallyVotes(votes ?? [], pollType), [votes, pollType]);
  const totalVotes = useMemo(() => {
    let sum = 0;
    for (const count of tally.values()) sum += count;
    return sum;
  }, [tally]);

  // Check if current user already voted
  const userVote = useMemo(() => {
    if (!user || !votes) return undefined;
    return votes.find((v) => v.pubkey === user.pubkey);
  }, [user, votes]);

  const hasVoted = !!userVote;
  const showResults = hasVoted || isExpired;

  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  const handleVote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedOption || !user || hasVoted || isExpired) return;
    publishEvent({
      kind: 1018,
      content: '',
      tags: [
        ['e', event.id],
        ['response', selectedOption],
      ],
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['poll-votes', event.id] });
      },
    });
  };

  // Collect all voter pubkeys for batch profile fetching
  const allVoterPubkeys = useMemo(() => {
    if (!votes) return [];
    return votes.map((v) => v.pubkey);
  }, [votes]);

  const { data: authorsMap } = useAuthors(allVoterPubkeys);

  const openVotersModal = (optionId: string | null) => {
    setVotersModalOptionId(optionId);
    setVotersModalOpen(true);
  };

  // Get the label for the modal
  const modalOptionLabel = useMemo(() => {
    if (votersModalOptionId === null) return 'All voters';
    return options.find((o) => o.id === votersModalOptionId)?.label ?? 'Voters';
  }, [votersModalOptionId, options]);

  // Get the voters to display in the modal
  const modalVoters = useMemo(() => {
    if (!votes) return [];
    if (votersModalOptionId === null) return votes;
    return getVotersForOption(votes, votersModalOptionId, pollType);
  }, [votes, votersModalOptionId, pollType]);

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {/* Question */}
      <div className="text-[15px] leading-relaxed font-medium break-words">
        <NoteContent event={event} />
      </div>

      {/* Poll type + expiry badges + voter avatars + vote count */}
      <div className="flex items-center gap-2 mt-2">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
          <BarChart3 className="size-3" />
          {pollType === 'multiplechoice' ? 'Multiple choice' : 'Single choice'}
        </span>
        {isExpired && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-secondary/60 px-2 py-0.5 rounded-full">
            <Clock className="size-3" />
            Ended
          </span>
        )}

        {/* Voter avatars + count pushed to the right */}
        {showResults && totalVotes > 0 && (
          <VoterAvatarsButton
            votes={votes ?? []}
            totalVotes={totalVotes}
            authorsMap={authorsMap}
            onClick={() => openVotersModal(null)}
            className="ml-auto"
          />
        )}
      </div>

      {/* Options */}
      <div className="mt-3 space-y-2">
        {options.map((opt) => {
          const count = tally.get(opt.id) ?? 0;
          const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
          const isMyVote = userVote?.tags.some(([n, id]) => n === 'response' && id === opt.id);
          const isSelected = selectedOption === opt.id;

          return showResults ? (
            <div key={opt.id} className="relative overflow-hidden rounded-lg border border-border">
              {/* Background fill bar */}
              <div
                className={cn(
                  'absolute inset-0 transition-all duration-500',
                  isMyVote ? 'bg-primary/15' : 'bg-secondary/40',
                )}
                style={{ width: `${pct}%` }}
              />
              <div className="relative flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2 min-w-0">
                  {isMyVote && <CheckCircle2 className="size-4 text-primary shrink-0" />}
                  <span className={cn('text-sm break-words', isMyVote && 'font-semibold')}>{opt.label}</span>
                </div>
                <span className="text-sm font-medium tabular-nums text-muted-foreground shrink-0 ml-3">
                  {pct}%
                </span>
              </div>
            </div>
          ) : (
            <button
              key={opt.id}
              onClick={() => setSelectedOption(opt.id)}
              className={cn(
                'w-full text-left rounded-lg border px-3 py-2.5 text-sm transition-colors',
                isSelected
                  ? 'border-primary bg-primary/10 font-semibold'
                  : 'border-border hover:bg-secondary/40',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Vote button + voter avatars (voting mode only) */}
      {!showResults && (
        <div className="flex items-center justify-between mt-3">
          {totalVotes > 0 ? (
            <VoterAvatarsButton
              votes={votes ?? []}
              totalVotes={totalVotes}
              authorsMap={authorsMap}
              onClick={() => openVotersModal(null)}
            />
          ) : (
            <span className="text-xs text-muted-foreground">0 votes</span>
          )}
          {user && (
            <button
              onClick={handleVote}
              disabled={!selectedOption}
              className={cn(
                'text-sm font-semibold px-4 py-1.5 rounded-full transition-colors',
                selectedOption
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-secondary text-muted-foreground cursor-not-allowed',
              )}
            >
              Vote
            </button>
          )}
        </div>
      )}

      {/* Voters Modal */}
      <PollVotersModal
        open={votersModalOpen}
        onOpenChange={setVotersModalOpen}
        title={modalOptionLabel}
        voters={modalVoters}
        options={options}
        pollType={pollType}
        authorsMap={authorsMap}
      />
    </div>
  );
}

/* ──── Poll Voters Modal ──── */

interface PollVotersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  voters: NostrEvent[];
  options: PollOption[];
  pollType: string;
  authorsMap?: Map<string, { pubkey: string; event?: NostrEvent; metadata?: import('@nostrify/nostrify').NostrMetadata }>;
}

function PollVotersModal({ open, onOpenChange, title, voters, options, pollType, authorsMap }: PollVotersModalProps) {
  // Build a map from option ID to label for display
  const optionLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const opt of options) {
      map.set(opt.id, opt.label);
    }
    return map;
  }, [options]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[460px] rounded-2xl p-0 gap-0 border-border overflow-hidden [&>button]:hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-12">
          <DialogTitle className="text-base font-semibold">{title}</DialogTitle>
          <button
            onClick={() => onOpenChange(false)}
            className="p-1.5 -mr-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <ScrollArea className="max-h-[60vh]">
          {voters.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              No votes yet
            </div>
          ) : (
            <div className="divide-y divide-border">
              {voters.map((vote) => (
                <VoterRow
                  key={vote.id}
                  vote={vote}
                  optionLabelMap={optionLabelMap}
                  pollType={pollType}
                  authorsMap={authorsMap}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

/* ──── Voter Row ──── */

interface VoterRowProps {
  vote: NostrEvent;
  optionLabelMap: Map<string, string>;
  pollType: string;
  authorsMap?: Map<string, { pubkey: string; event?: NostrEvent; metadata?: import('@nostrify/nostrify').NostrMetadata }>;
}

function VoterRow({ vote, optionLabelMap, pollType, authorsMap }: VoterRowProps) {
  // Use batch-fetched author data if available, fall back to individual fetch
  const individualAuthor = useAuthor(authorsMap?.has(vote.pubkey) ? undefined : vote.pubkey);
  const authorData = authorsMap?.get(vote.pubkey) ?? individualAuthor.data;
  const metadata = authorData?.metadata;
  const avatarShape = getAvatarShape(metadata);
  const displayName = metadata?.name || genUserName(vote.pubkey);

  const nevent = useMemo(
    () => nip19.neventEncode({ id: vote.id, author: vote.pubkey }),
    [vote.id, vote.pubkey],
  );

  // Resolve which option(s) this person voted for
  const votedOptions = useMemo(() => {
    const responseTags = vote.tags.filter(([n]) => n === 'response');
    if (pollType === 'singlechoice') {
      const id = responseTags[0]?.[1];
      const label = id ? optionLabelMap.get(id) : undefined;
      return label ? [label] : [];
    }
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const [, id] of responseTags) {
      if (id && !seen.has(id)) {
        seen.add(id);
        const label = optionLabelMap.get(id);
        if (label) labels.push(label);
      }
    }
    return labels;
  }, [vote.tags, pollType, optionLabelMap]);

  return (
    <Link
      to={`/${nevent}`}
      onClick={() => {
        // Close any open dialogs by dispatching escape
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      }}
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
            {authorData?.event ? (
              <EmojifiedText tags={authorData.event.tags}>{displayName}</EmojifiedText>
            ) : displayName}
          </span>
          {metadata?.nip05 && (
            <VerifiedNip05Text nip05={metadata.nip05} pubkey={vote.pubkey} className="text-xs text-muted-foreground truncate" />
          )}
        </div>
        <div className="flex items-center gap-2">
          {votedOptions.length > 0 && (
            <span className="text-xs text-muted-foreground truncate">
              {votedOptions.join(', ')}
            </span>
          )}
          <span className="text-xs text-muted-foreground shrink-0">{timeAgo(vote.created_at)}</span>
        </div>
      </div>

      <ChevronRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}


