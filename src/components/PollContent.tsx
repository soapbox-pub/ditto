import { useState, useMemo } from 'react';
import { BarChart3, CheckCircle2, Clock } from 'lucide-react';
import { useNostr } from '@nostrify/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { NoteContent } from '@/components/NoteContent';
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

export function PollContent({ event }: { event: NostrEvent }) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutate: publishEvent } = useNostrPublish();

  const options = useMemo(() => getOptions(event.tags), [event.tags]);
  const pollType = getTag(event.tags, 'polltype') ?? 'singlechoice';
  const endsAt = getTag(event.tags, 'endsAt');
  const isExpired = endsAt ? Number(endsAt) < Math.floor(Date.now() / 1000) : false;

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

  return (
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      {/* Question */}
      <div className="text-[15px] leading-relaxed font-medium break-words">
        <NoteContent event={event} />
      </div>

      {/* Poll type + expiry badges */}
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

      {/* Vote button or total */}
      <div className="flex items-center justify-between mt-3">
        <span className="text-xs text-muted-foreground">
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
        </span>
        {!showResults && user && (
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
    </div>
  );
}
