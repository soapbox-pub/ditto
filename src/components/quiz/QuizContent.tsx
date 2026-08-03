import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';

import { QuizResultsList } from '@/components/quiz/QuizResultsList';
import { QuizTaker } from '@/components/quiz/QuizTaker';
import { Button } from '@/components/ui/button';
import { encodeEventAddress } from '@/lib/encodeEvent';
import { getEventFallbackText } from '@/lib/extraKinds';
import { parseQuiz } from '@/lib/quiz';
import { cn } from '@/lib/utils';

import type { NostrEvent } from '@nostrify/nostrify';

interface QuizContentProps {
  event: NostrEvent;
  /** When true, render the full quiz-taking experience for the detail page. */
  expanded?: boolean;
  className?: string;
}

/**
 * Renders a kind 37849 quiz.
 *
 * - Feed variant: cover, title, summary, question count, and a "Take quiz"
 *   link to the detail page.
 * - Expanded (detail page): full description, the interactive QuizTaker, and
 *   the list of published results with follows surfaced first.
 */
export function QuizContent({ event, expanded = false, className }: QuizContentProps) {
  const quiz = useMemo(() => parseQuiz(event), [event]);
  const href = useMemo(() => `/${encodeEventAddress(event)}`, [event]);

  if (!quiz) {
    return (
      <p className={cn('mt-2 text-sm italic text-muted-foreground', className)}>
        {getEventFallbackText(event) ?? 'This quiz could not be displayed.'}
      </p>
    );
  }

  const questionCount = quiz.questions.length;
  const meta = (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <ClipboardList className="size-3.5" />
      <span>{questionCount} {questionCount === 1 ? 'question' : 'questions'}</span>
    </div>
  );

  if (!expanded) {
    return (
      <div className={cn('mt-2 space-y-3', className)}>
        {quiz.image && (
          <img
            src={quiz.image}
            alt=""
            loading="lazy"
            className="max-h-64 w-full rounded-xl border object-cover"
          />
        )}
        <div>
          <h3 className="text-lg font-bold leading-snug">{quiz.title}</h3>
          {(quiz.summary || quiz.description) && (
            <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
              {quiz.summary || quiz.description}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3">
          {meta}
          <Button asChild size="sm" onClick={(e) => e.stopPropagation()}>
            <Link to={href}>Take quiz</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('mt-3 space-y-4', className)}>
      {quiz.image && (
        <img
          src={quiz.image}
          alt=""
          className="max-h-80 w-full rounded-xl border object-cover"
        />
      )}
      <div>
        <h2 className="text-xl font-bold leading-snug">{quiz.title}</h2>
        {quiz.summary && (
          <p className="mt-1 text-base text-muted-foreground">{quiz.summary}</p>
        )}
        <div className="mt-2">{meta}</div>
      </div>
      {quiz.description && (
        <p className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-foreground">
          {quiz.description}
        </p>
      )}
      <QuizTaker quiz={quiz} />
      <QuizResultsList quiz={quiz} />
    </div>
  );
}
