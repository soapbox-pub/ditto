import { useCallback, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Send } from 'lucide-react';
import type { PendingInput } from '@soapbox.pub/nostr-canvas/devkit';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { formatQuestionsAnswer, parseAskQuestionsData } from '@/lib/pendingInput';

interface PendingQuestionsCardProps {
  /** The live pending-input payload from the session's AgentSnapshot. */
  pendingInput: PendingInput;
  /** Called with the formatted answer string once every question is answered. */
  onAnswer: (answer: string) => void;
}

/** Tap-friendly answer chip: highlighted once selected, tinted on hover. */
function suggestionButtonClassName(selected: boolean): string {
  return cn(
    'rounded-lg border px-4 py-2 text-sm transition-colors',
    selected
      ? 'border-primary bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary'
      : 'border-border bg-background text-foreground hover:bg-muted',
  );
}

/**
 * Answer UI for the ask_questions tool. Devkit pauses the AgentSession with
 * a `pending-input` result and `pendingInput.data` holding the questions;
 * this card renders one answer control per question (suggestion chips plus a
 * "Custom…" text field when suggestions exist, a plain text field otherwise)
 * and submits the joined answer string through the same `sendMessage` path
 * a normal user message takes, which resolves the session's pending input.
 */
export function PendingQuestionsCard({ pendingInput, onAnswer }: PendingQuestionsCardProps) {
  const intl = useIntl();
  const questions = parseAskQuestionsData(pendingInput.data);
  const [answers, setAnswers] = useState<string[]>(() =>
    questions ? questions.map(() => '') : [],
  );
  // Whether question i is showing its free-text input. Starts true only for
  // questions without suggestions; a question with suggestions starts in
  // chip mode and switches to its text field only when "Custom…" is chosen.
  const [customMode, setCustomMode] = useState<boolean[]>(() =>
    questions ? questions.map((q) => !q.suggestions || q.suggestions.length === 0) : [],
  );

  const allAnswered = questions
    ? questions.every((_q, i) => (answers[i] ?? '').trim().length > 0)
    : false;

  const setAnswer = useCallback((index: number, value: string) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!questions || !allAnswered) return;
    onAnswer(formatQuestionsAnswer(questions, answers));
  }, [allAnswered, onAnswer, questions, answers]);

  if (!questions) {
    return (
      <div className="rounded-2xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <FormattedMessage
          id="ai-chat.pendingQuestions.parseError"
          defaultMessage="This request could not be displayed. Please try sending your message again."
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-secondary/60 p-4 space-y-3">
      <p className="text-sm font-semibold text-primary">
        <FormattedMessage
          id="ai-chat.pendingQuestions.title"
          defaultMessage="A few quick questions before I continue"
        />
      </p>
      <div className="space-y-4">
        {questions.map((q, i) => {
          const hasSuggestions = !!q.suggestions && q.suggestions.length > 0;
          const showInput = !hasSuggestions || customMode[i];
          return (
            <div key={i} className="space-y-2">
              <label className="text-sm font-medium text-foreground" htmlFor={`pending-question-${i}`}>
                {q.text}
              </label>
              {hasSuggestions && (
                <div className="flex flex-wrap gap-2">
                  {q.suggestions!.map((s) => (
                    <Button
                      key={s}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCustomMode((prev) => prev.map((v, idx) => (idx === i ? false : v)));
                        setAnswer(i, s);
                      }}
                      className={suggestionButtonClassName(!customMode[i] && answers[i] === s)}
                    >
                      {s}
                    </Button>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCustomMode((prev) => prev.map((v, idx) => (idx === i ? true : v)));
                      setAnswer(i, '');
                    }}
                    className={suggestionButtonClassName(customMode[i])}
                  >
                    <FormattedMessage id="ai-chat.pendingQuestions.custom" defaultMessage="Custom…" />
                  </Button>
                </div>
              )}
              {showInput && (
                <Input
                  id={`pending-question-${i}`}
                  type="text"
                  autoFocus={hasSuggestions}
                  value={answers[i]}
                  onChange={(e) => setAnswer(i, e.target.value)}
                  placeholder={intl.formatMessage({
                    id: 'ai-chat.pendingQuestions.answerPlaceholder',
                    defaultMessage: 'Type your answer…',
                  })}
                  className="h-9"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!allAnswered}
          className="gap-1.5"
          title={intl.formatMessage({
            id: 'ai-chat.pendingQuestions.submit',
            defaultMessage: 'Submit answers',
          })}
        >
          <Send className="size-4" />
          <FormattedMessage id="ai-chat.pendingQuestions.submit" defaultMessage="Submit answers" />
        </Button>
      </div>
    </div>
  );
}
