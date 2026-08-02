/**
 * Parsing and formatting helpers for the ask_questions tool's pending-input
 * payload. `AskQuestionsTool.execute()` returns
 * `{ type: 'pending-input', data: { questions: [{ text, suggestions? }] } }`
 * and pauses the AgentSession until the user answers. These helpers turn
 * that payload into renderable questions and back into the raw answer string
 * the session's `resolvePendingInput` expects.
 *
 * `parseAskQuestionsData` returns `null` for any malformed shape instead of
 * throwing, so the UI can render a fallback message for bad data.
 */

export interface PendingQuestion {
  text: string;
  suggestions?: string[];
}

/** Validate a pending-input `data` payload into questions, or return null. */
export function parseAskQuestionsData(data: unknown): PendingQuestion[] | null {
  if (data === null || data === undefined) return null;
  if (typeof data !== 'object') return null;
  if (Array.isArray(data)) return null;

  const obj = data as Record<string, unknown>;
  const questions = obj.questions;
  if (!Array.isArray(questions)) return null;
  if (questions.length === 0) return null;

  const result: PendingQuestion[] = [];

  for (const q of questions) {
    if (q === null) return null;
    if (typeof q !== 'object' || Array.isArray(q)) return null;

    const item = q as Record<string, unknown>;
    if (typeof item.text !== 'string' || item.text.trim().length === 0) return null;

    const entry: PendingQuestion = { text: item.text };

    if ('suggestions' in item) {
      const suggestions = item.suggestions;
      if (!Array.isArray(suggestions)) return null;
      if (suggestions.length > 0) {
        for (const s of suggestions) {
          if (typeof s !== 'string') return null;
        }
      }
      entry.suggestions = [...suggestions];
    }

    result.push(entry);
  }

  return result;
}

/** Join answered questions into the one-line-per-question answer string. */
export function formatQuestionsAnswer(
  questions: PendingQuestion[],
  answers: string[],
): string {
  return questions
    .map((q, i) => `Q${i + 1}: ${q.text}\nA${i + 1}: ${(answers[i] ?? '').trim()}`)
    .join('\n\n');
}
