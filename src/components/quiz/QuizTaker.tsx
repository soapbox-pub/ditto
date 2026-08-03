import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, PartyPopper, RotateCcw, Share2 } from 'lucide-react';

import { QuizScoreBars } from '@/components/quiz/QuizScoreBars';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useMyQuizResult } from '@/hooks/useQuizResults';
import { useToast } from '@/hooks/useToast';
import {
  buildQuizResultTags,
  computeQuizScores,
  matchQuizOutcomes,
  parseQuizResult,
  QUIZ_RESULT_KIND,
  quizDimensionBounds,
} from '@/lib/quiz';

import type { ParsedQuiz, QuizOutcome, QuizResultScore, QuizScores } from '@/lib/quiz';

interface QuizTakerProps {
  quiz: ParsedQuiz;
}

/**
 * Interactive quiz-taking flow: one question at a time with a progress bar,
 * then a local results screen with an explicit opt-in "Share result" action
 * (kind 7849). Nothing is published until the user asks.
 */
export function QuizTaker({ quiz }: QuizTakerProps) {
  const { user } = useCurrentUser();
  const { data: myResult } = useMyQuizResult(quiz.address);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [retaking, setRetaking] = useState(false);

  const restart = () => {
    setAnswers({});
    setIndex(0);
    setFinished(false);
    setRetaking(true);
  };

  // A previously published result short-circuits the flow until "Retake".
  if (myResult && !retaking && !finished) {
    const parsed = parseQuizResult(myResult);
    if (parsed) {
      return (
        <section aria-label="Your quiz result" className="rounded-2xl border bg-card p-4 sm:p-5">
          <ResultSummary
            quiz={quiz}
            outcomes={parsed.outcomes.map((o) =>
              quiz.outcomes.find((def) => def.id === o.id) ?? { ...o, conditions: [] }
            )}
            scores={parsed.scores}
          />
          <Button variant="outline" size="sm" className="mt-4" onClick={restart}>
            <RotateCcw className="size-4" />
            Retake quiz
          </Button>
        </section>
      );
    }
  }

  if (finished) {
    return (
      <QuizResultScreen
        quiz={quiz}
        answers={answers}
        isLoggedIn={!!user}
        onRetake={restart}
      />
    );
  }

  const question = quiz.questions[index];
  const total = quiz.questions.length;
  const selected = answers[question.id];
  const isLast = index === total - 1;

  return (
    <section aria-label="Take this quiz" className="rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
        <span>Question {index + 1} of {total}</span>
      </div>
      <Progress value={((index) / total) * 100} className="mt-2 h-1.5" />

      <h3 className="mt-4 text-base font-semibold leading-snug">{question.text}</h3>

      <RadioGroup
        key={question.id}
        value={selected ?? ''}
        onValueChange={(value) => setAnswers((prev) => ({ ...prev, [question.id]: value }))}
        className="mt-4 space-y-2"
      >
        {question.options.map((option) => (
          <Label
            key={option.id}
            htmlFor={`${quiz.event.id}-${question.id}-${option.id}`}
            className="flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm font-normal transition-colors hover:bg-secondary/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
          >
            <RadioGroupItem
              id={`${quiz.event.id}-${question.id}-${option.id}`}
              value={option.id}
            />
            <span className="break-words">{option.label}</span>
          </Label>
        ))}
      </RadioGroup>

      <div className="mt-4 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          size="sm"
          disabled={!selected}
          onClick={() => (isLast ? setFinished(true) : setIndex((i) => i + 1))}
        >
          {isLast ? 'See results' : 'Next'}
          {!isLast && <ArrowRight className="size-4" />}
        </Button>
      </div>
    </section>
  );
}

/** Post-completion screen: computed result + opt-in sharing. */
function QuizResultScreen({
  quiz,
  answers,
  isLoggedIn,
  onRetake,
}: {
  quiz: ParsedQuiz;
  answers: Record<string, string>;
  isLoggedIn: boolean;
  onRetake: () => void;
}) {
  const { mutate: publishEvent, isPending } = useNostrPublish();
  const { user } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [comment, setComment] = useState('');
  const [includeAnswers, setIncludeAnswers] = useState(false);
  const [shared, setShared] = useState(false);

  const { scores, outcomes, resultScores } = useMemo(() => {
    const scores = computeQuizScores(quiz, answers);
    const outcomes = matchQuizOutcomes(quiz, scores);
    return { scores, outcomes, resultScores: toResultScores(quiz, scores) };
  }, [quiz, answers]);

  const share = () => {
    publishEvent(
      {
        kind: QUIZ_RESULT_KIND,
        content: comment.trim(),
        tags: buildQuizResultTags(quiz, scores, outcomes, { includeAnswers, answers }),
      },
      {
        onSuccess: () => {
          setShared(true);
          toast({ title: 'Result shared', description: 'Your quiz result has been published.' });
          queryClient.invalidateQueries({ queryKey: ['quiz-results', quiz.address] });
          queryClient.invalidateQueries({ queryKey: ['quiz-my-result', quiz.address, user?.pubkey ?? ''] });
        },
        onError: () => {
          toast({ title: 'Failed to share result', variant: 'destructive' });
        },
      },
    );
  };

  return (
    <section aria-label="Your quiz result" className="rounded-2xl border bg-card p-4 sm:p-5">
      <ResultSummary quiz={quiz} outcomes={outcomes} scores={resultScores} />

      <div className="mt-4 space-y-3 border-t pt-4">
        {shared ? (
          <p className="text-sm text-muted-foreground">
            Your result is published — your friends can see it on this quiz.
          </p>
        ) : isLoggedIn ? (
          <>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a comment to your result (optional)"
              rows={2}
              className="resize-none"
            />
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={`include-answers-${quiz.event.id}`} className="text-xs font-normal text-muted-foreground">
                Include my answers (lets others verify your result)
              </Label>
              <Switch
                id={`include-answers-${quiz.event.id}`}
                checked={includeAnswers}
                onCheckedChange={setIncludeAnswers}
              />
            </div>
            <Button className="w-full" onClick={share} disabled={isPending}>
              <Share2 className="size-4" />
              {isPending ? 'Sharing…' : 'Share result'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Nothing is published until you share.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Log in to share your result with friends.
          </p>
        )}

        <Button variant="ghost" size="sm" className="w-full" onClick={onRetake}>
          <RotateCcw className="size-4" />
          Retake quiz
        </Button>
      </div>
    </section>
  );
}

/** Outcome labels + descriptions + score bars. */
function ResultSummary({
  quiz,
  outcomes,
  scores,
}: {
  quiz: ParsedQuiz;
  outcomes: QuizOutcome[];
  scores: QuizResultScore[];
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <PartyPopper className="size-3" />
        Your result
      </div>

      {outcomes.length > 0 && (
        <div className="mt-2 space-y-3">
          {outcomes.map((outcome) => (
            <div key={outcome.id}>
              {outcome.image && (
                <img
                  src={outcome.image}
                  alt={outcome.label}
                  className="mb-2 max-h-56 w-full rounded-xl border object-cover"
                />
              )}
              <p className="text-xl font-bold text-foreground">{outcome.label}</p>
              {outcome.description && (
                <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {outcome.description}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <QuizScoreBars scores={scores} className="mt-4" />
      {quiz.scoring === 'scores' && outcomes.length === 0 && scores.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">No scores to display.</p>
      )}
    </div>
  );
}

/** Convert live scores to the display shape used by QuizScoreBars. */
function toResultScores(quiz: ParsedQuiz, scores: QuizScores): QuizResultScore[] {
  const bounds = quizDimensionBounds(quiz);
  return quiz.dimensions.map((dim) => ({
    dimension: dim.id,
    value: scores[dim.id] ?? 0,
    label: dim.label,
    min: bounds[dim.id].min,
    max: bounds[dim.id].max,
  }));
}
