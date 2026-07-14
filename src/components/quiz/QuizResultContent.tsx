import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';

import { QuizScoreBars } from '@/components/quiz/QuizScoreBars';
import { Button } from '@/components/ui/button';
import { useAddrEvent } from '@/hooks/useEvent';
import { QUIZ_KIND, parseQuiz, parseQuizResult } from '@/lib/quiz';
import { tryNaddrEncode } from '@/lib/safeNip19';
import { cn } from '@/lib/utils';

import type { NostrEvent } from '@nostrify/nostrify';

interface QuizResultContentProps {
  event: NostrEvent;
  /** When true, render a larger variant for the detail page. */
  expanded?: boolean;
  className?: string;
}

/**
 * Renders a kind 7849 quiz result: the taker's comment, their outcome(s) and
 * score bars (all denormalized in the event), plus a link to take the quiz
 * yourself. The quiz is fetched only for its title and outcome descriptions;
 * the card renders fine without it.
 */
export function QuizResultContent({ event, expanded = false, className }: QuizResultContentProps) {
  const result = useMemo(() => parseQuizResult(event), [event]);

  const { data: quizEvent } = useAddrEvent(
    result
      ? { kind: QUIZ_KIND, pubkey: result.quizPubkey, identifier: result.quizIdentifier }
      : undefined,
  );
  const quiz = useMemo(() => (quizEvent ? parseQuiz(quizEvent) : null), [quizEvent]);

  if (!result) {
    return (
      <p className={cn('mt-2 text-sm italic text-muted-foreground', className)}>
        This quiz result could not be displayed.
      </p>
    );
  }

  const naddr = tryNaddrEncode({
    kind: QUIZ_KIND,
    pubkey: result.quizPubkey,
    identifier: result.quizIdentifier,
  });

  return (
    <div className={cn(expanded ? 'mt-3 space-y-3' : 'mt-2 space-y-2.5', className)}>
      {result.comment && (
        <p
          dir="auto"
          className={cn(
            'whitespace-pre-wrap break-words text-foreground',
            expanded ? 'text-[17px] leading-relaxed' : 'text-[15px] leading-relaxed',
          )}
        >
          {result.comment}
        </p>
      )}

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <ClipboardCheck className="size-3" />
          Quiz result
          {quiz && (
            <>
              <span aria-hidden>·</span>
              {naddr ? (
                <Link
                  to={`/${naddr}`}
                  className="truncate normal-case tracking-normal hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {quiz.title}
                </Link>
              ) : (
                <span className="truncate normal-case tracking-normal">{quiz.title}</span>
              )}
            </>
          )}
        </div>

        {result.outcomes.length > 0 && (
          <div className="mt-2 space-y-3">
            {result.outcomes.map((outcome) => {
              const def = quiz?.outcomes.find((o) => o.id === outcome.id);
              const image = outcome.image ?? def?.image;
              return (
                <div key={outcome.id}>
                  {image && (
                    <img
                      src={image}
                      alt={outcome.label}
                      loading="lazy"
                      className={cn(
                        'mb-2 w-full rounded-xl border object-cover',
                        expanded ? 'max-h-64' : 'max-h-44',
                      )}
                    />
                  )}
                  <p className={cn('font-bold text-foreground', expanded ? 'text-xl' : 'text-lg')}>
                    {outcome.label}
                  </p>
                  {expanded && def?.description && (
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {def.description}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {result.scores.length > 0 && (
          <QuizScoreBars
            scores={expanded || result.outcomes.length === 0 ? result.scores : result.scores.slice(0, 4)}
            className="mt-3"
          />
        )}

        {naddr && (
          <Button
            asChild
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Link to={`/${naddr}`}>Take this quiz</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
