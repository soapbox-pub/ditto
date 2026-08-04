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

/**
 * Parse a formatted answer string (as produced by `formatQuestionsAnswer`)
 * back into one answer per question. Blocks are delimited by `Q\d+:` marker
 * lines rather than blank lines, so a free-text answer can freely contain
 * blank lines or multiple paragraphs (e.g. pasted text) without breaking the
 * split — each answer runs from its `A\d+:` line up to the next `Q\d+:`
 * marker or the end of the string. The only edge case this does not handle
 * is an answer whose own text contains a line that itself looks like a
 * `Q\d+:` marker, which would be misread as the start of the next block.
 * Returns `null` when the string does not shape up as exactly `count`
 * blocks, so the caller can fall back to raw rendering.
 */
export function parseQuestionsAnswerText(result: string, count: number): string[] | null {
  if (typeof result !== 'string' || result.trim().length === 0) return null;

  const markerRe = /^Q\d+: /gm;
  const starts: number[] = [];
  for (let match = markerRe.exec(result); match !== null; match = markerRe.exec(result)) {
    starts.push(match.index);
  }
  if (starts.length !== count) return null;

  const answers: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const block = result.slice(starts[i], starts[i + 1] ?? result.length);
    const match = block.match(/^A\d+: ?([\s\S]*)$/m);
    if (!match) return null;
    answers.push(match[1].trimEnd());
  }
  return answers;
}
