import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useFollowList } from '@/hooks/useFollowActions';
import { useQuizResults } from '@/hooks/useQuizResults';
import { getAvatarShape } from '@/lib/avatarShape';
import { getDisplayName } from '@/lib/getDisplayName';
import { parseQuizResult } from '@/lib/quiz';
import { tryNeventEncode } from '@/lib/safeNip19';
import { timeAgo } from '@/lib/timeAgo';

import type { NostrEvent } from '@nostrify/nostrify';
import type { ParsedQuiz } from '@/lib/quiz';

interface QuizResultsListProps {
  quiz: ParsedQuiz;
}

/**
 * Published results for a quiz, with people the user follows surfaced first.
 * Results are public UGC, so everyone's results are shown — follows are just
 * sorted to the top and labeled.
 */
export function QuizResultsList({ quiz }: QuizResultsListProps) {
  const { data: results, isLoading } = useQuizResults(quiz.address);
  const { data: followList } = useFollowList();
  const { user } = useCurrentUser();

  const { friends, others } = useMemo(() => {
    const follows = new Set(followList?.pubkeys ?? []);
    const friends: NostrEvent[] = [];
    const others: NostrEvent[] = [];
    for (const event of results ?? []) {
      if (event.pubkey === user?.pubkey || follows.has(event.pubkey)) {
        friends.push(event);
      } else {
        others.push(event);
      }
    }
    return { friends, others };
  }, [results, followList?.pubkeys, user?.pubkey]);

  if (isLoading) {
    return (
      <section className="space-y-2" aria-label="Quiz results">
        <ResultsHeading />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-1">
              <Skeleton className="h-3.5 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </section>
    );
  }

  if (!results || results.length === 0) {
    return (
      <section aria-label="Quiz results">
        <ResultsHeading />
        <div className="mt-2 rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          No one has shared a result yet. Be the first!
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3" aria-label="Quiz results">
      <div>
        <ResultsHeading count={results.length} />
      </div>

      {friends.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">People you follow</p>
          {friends.map((event) => <ResultRow key={event.id} event={event} />)}
        </div>
      )}

      {others.length > 0 && (
        <div className="space-y-1.5">
          {friends.length > 0 && (
            <p className="text-xs font-medium text-muted-foreground">Everyone else</p>
          )}
          {others.map((event) => <ResultRow key={event.id} event={event} />)}
        </div>
      )}
    </section>
  );
}

function ResultsHeading({ count }: { count?: number }) {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
      <Users className="size-4 text-muted-foreground" />
      Results
      {count !== undefined && (
        <span className="font-normal text-muted-foreground">({count})</span>
      )}
    </h3>
  );
}

/** One taker's result: avatar, name, outcome labels, age. */
function ResultRow({ event }: { event: NostrEvent }) {
  const author = useAuthor(event.pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, event.pubkey);

  const parsed = parseQuizResult(event);
  const nevent = tryNeventEncode({ id: event.id, author: event.pubkey });
  if (!parsed) return null;

  const outcomeText = parsed.outcomes.length > 0
    ? parsed.outcomes.map((o) => o.label).join(', ')
    : parsed.scores.map((s) => `${s.label ?? s.dimension}: ${s.value}`).join(' · ');

  const outcomeImage = parsed.outcomes.find((o) => o.image)?.image;

  const row = (
    <>
      <Avatar shape={getAvatarShape(metadata)} className="size-8 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="bg-primary/20 text-xs text-primary">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{displayName}</p>
        {outcomeText && (
          <p className="truncate text-xs text-muted-foreground">{outcomeText}</p>
        )}
      </div>
      {outcomeImage && (
        <img
          src={outcomeImage}
          alt=""
          loading="lazy"
          className="size-10 shrink-0 rounded-lg border object-cover"
        />
      )}
      <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(event.created_at)}</span>
    </>
  );

  const className = 'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors hover:bg-secondary/50';

  if (!nevent) {
    return <div className={className}>{row}</div>;
  }

  return (
    <Link to={`/${nevent}`} className={className} onClick={(e) => e.stopPropagation()}>
      {row}
    </Link>
  );
}
