import { isNostrId } from '@/lib/nostrId';
import { sanitizeUrl } from '@/lib/sanitizeUrl';

import type { NostrEvent } from '@nostrify/nostrify';

/** Addressable quiz definition. "QUIZ" typed on a phone keypad (7-8-4-9). */
export const QUIZ_KIND = 37849;
/** Regular quiz result event — a user's computed result for a kind 37849 quiz. */
export const QUIZ_RESULT_KIND = 7849;

/**
 * How dimension totals map to a displayed result.
 *
 * - `argmax`  — highest-scoring dimension wins; its outcome applies.
 * - `ranges`  — every outcome whose `dim:min:max` conditions all hold applies.
 * - `scores`  — no outcomes; the dimension totals themselves are the result.
 */
export type QuizScoringMode = 'argmax' | 'ranges' | 'scores';

/** Identifier charset for dimensions, questions, options, and outcomes. */
const ID_RE = /^[a-zA-Z0-9_-]+$/;

export interface QuizDimension {
  id: string;
  label: string;
}

export interface QuizOption {
  id: string;
  label: string;
  /** Dimension id → weight added when this option is chosen. */
  weights: Record<string, number>;
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: QuizOption[];
}

/** Inclusive range condition over one dimension. Missing bound = unbounded. */
export interface QuizRangeCondition {
  dimension: string;
  min?: number;
  max?: number;
}

export interface QuizOutcome {
  id: string;
  label: string;
  description?: string;
  /** Sanitized HTTPS image URL shown with the result. */
  image?: string;
  /** Only meaningful in `ranges` mode. ANDed together. */
  conditions: QuizRangeCondition[];
}

export interface ParsedQuiz {
  event: NostrEvent;
  d: string;
  title: string;
  summary?: string;
  /** Sanitized HTTPS cover image URL. */
  image?: string;
  /** Freeform description from `content`. */
  description: string;
  dimensions: QuizDimension[];
  questions: QuizQuestion[];
  scoring: QuizScoringMode;
  outcomes: QuizOutcome[];
  /** Addressable coordinate `37849:<pubkey>:<d>`. */
  address: string;
}

/** Dimension id → total. */
export type QuizScores = Record<string, number>;

export interface QuizResultScore {
  dimension: string;
  value: number;
  /** Denormalized display label (falls back to the dimension id). */
  label?: string;
  min?: number;
  max?: number;
}

export interface ParsedQuizResult {
  event: NostrEvent;
  /** Quiz coordinate `37849:<pubkey>:<d>`. */
  address: string;
  quizPubkey: string;
  quizIdentifier: string;
  /** Event id of the exact quiz revision taken, when pinned. */
  quizEventId?: string;
  outcomes: { id: string; label: string; image?: string }[];
  scores: QuizResultScore[];
  /** Question id → chosen option id (present only when the taker opted in). */
  answers: Record<string, string>;
  /** Freeform comment from `content`. */
  comment: string;
}

function parseFiniteNumber(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

/** Parse a `dim:weight` entry. Returns undefined when malformed. */
function parseWeight(raw: string): { dimension: string; weight: number } | undefined {
  const idx = raw.indexOf(':');
  if (idx <= 0) return undefined;
  const dimension = raw.slice(0, idx);
  if (!ID_RE.test(dimension)) return undefined;
  const weight = parseFiniteNumber(raw.slice(idx + 1));
  if (weight === undefined) return undefined;
  return { dimension, weight };
}

/** Parse a `dim:min:max` condition (empty bound = unbounded). */
function parseCondition(raw: string): QuizRangeCondition | undefined {
  const parts = raw.split(':');
  if (parts.length !== 3) return undefined;
  const [dimension, rawMin, rawMax] = parts;
  if (!ID_RE.test(dimension)) return undefined;
  const min = parseFiniteNumber(rawMin);
  const max = parseFiniteNumber(rawMax);
  if (rawMin.trim() !== '' && min === undefined) return undefined;
  if (rawMax.trim() !== '' && max === undefined) return undefined;
  return { dimension, min, max };
}

/**
 * Parse a kind 37849 quiz event into a structured quiz.
 *
 * Returns `null` when the event is not a renderable quiz: missing title,
 * no dimensions, no questions, or any question with fewer than two options.
 * Malformed weight/condition entries are dropped rather than failing the
 * whole quiz.
 */
export function parseQuiz(event: NostrEvent): ParsedQuiz | null {
  if (event.kind !== QUIZ_KIND) return null;

  const d = event.tags.find(([n]) => n === 'd')?.[1];
  const title = event.tags.find(([n]) => n === 'title')?.[1]?.trim();
  if (d === undefined || !title) return null;

  const dimensions: QuizDimension[] = [];
  const seenDims = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== 'dimension') continue;
    const [, id, label] = tag;
    if (!id || !ID_RE.test(id) || seenDims.has(id)) continue;
    seenDims.add(id);
    dimensions.push({ id, label: label?.trim() || id });
  }

  const questions: QuizQuestion[] = [];
  const questionById = new Map<string, QuizQuestion>();
  for (const tag of event.tags) {
    if (tag[0] !== 'question') continue;
    const [, id, text] = tag;
    if (!id || !ID_RE.test(id) || !text?.trim() || questionById.has(id)) continue;
    const question: QuizQuestion = { id, text: text.trim(), options: [] };
    questionById.set(id, question);
    questions.push(question);
  }

  for (const tag of event.tags) {
    if (tag[0] !== 'option') continue;
    const [, questionId, id, label, ...weightEntries] = tag;
    if (!questionId || !id || !ID_RE.test(id) || !label?.trim()) continue;
    const question = questionById.get(questionId);
    if (!question || question.options.some((o) => o.id === id)) continue;
    const weights: Record<string, number> = {};
    for (const entry of weightEntries) {
      const parsed = parseWeight(entry);
      if (parsed && seenDims.has(parsed.dimension)) {
        weights[parsed.dimension] = (weights[parsed.dimension] ?? 0) + parsed.weight;
      }
    }
    question.options.push({ id, label: label.trim(), weights });
  }

  const answerable = questions.filter((q) => q.options.length >= 2);
  if (answerable.length === 0 || dimensions.length === 0) return null;

  const rawScoring = event.tags.find(([n]) => n === 'scoring')?.[1];
  const scoring: QuizScoringMode =
    rawScoring === 'ranges' || rawScoring === 'scores' || rawScoring === 'argmax'
      ? rawScoring
      : 'argmax';

  const outcomes: QuizOutcome[] = [];
  const seenOutcomes = new Set<string>();
  for (const tag of event.tags) {
    if (tag[0] !== 'outcome') continue;
    const [, id, label, description, image, ...rawConditions] = tag;
    if (!id || !ID_RE.test(id) || !label?.trim() || seenOutcomes.has(id)) continue;
    seenOutcomes.add(id);
    const conditions: QuizRangeCondition[] = [];
    for (const raw of rawConditions) {
      const cond = parseCondition(raw);
      if (cond && seenDims.has(cond.dimension)) conditions.push(cond);
    }
    outcomes.push({
      id,
      label: label.trim(),
      description: description?.trim() || undefined,
      image: sanitizeUrl(image),
      conditions,
    });
  }

  return {
    event,
    d,
    title,
    summary: event.tags.find(([n]) => n === 'summary')?.[1]?.trim() || undefined,
    image: sanitizeUrl(event.tags.find(([n]) => n === 'image')?.[1]),
    description: event.content.trim(),
    dimensions,
    questions: answerable,
    scoring,
    outcomes,
    address: `${QUIZ_KIND}:${event.pubkey}:${d}`,
  };
}

/** True when the event parses as a renderable quiz. */
export function isValidQuiz(event: NostrEvent): boolean {
  return parseQuiz(event) !== null;
}

/** Sum option weights for the chosen answers into per-dimension totals. */
export function computeQuizScores(quiz: ParsedQuiz, answers: Record<string, string>): QuizScores {
  const scores: QuizScores = {};
  for (const dim of quiz.dimensions) scores[dim.id] = 0;
  for (const question of quiz.questions) {
    const option = question.options.find((o) => o.id === answers[question.id]);
    if (!option) continue;
    for (const [dim, weight] of Object.entries(option.weights)) {
      scores[dim] = (scores[dim] ?? 0) + weight;
    }
  }
  return scores;
}

/**
 * Theoretical per-dimension bounds: for each question, the min/max weight any
 * option contributes to the dimension, summed across questions. Used to
 * normalize score bars.
 */
export function quizDimensionBounds(quiz: ParsedQuiz): Record<string, { min: number; max: number }> {
  const bounds: Record<string, { min: number; max: number }> = {};
  for (const dim of quiz.dimensions) {
    let min = 0;
    let max = 0;
    for (const question of quiz.questions) {
      const weights = question.options.map((o) => o.weights[dim.id] ?? 0);
      min += Math.min(...weights);
      max += Math.max(...weights);
    }
    bounds[dim.id] = { min, max };
  }
  return bounds;
}

/**
 * Map computed scores to matched outcomes according to the quiz's scoring
 * mode. In `argmax` mode the winner always produces exactly one entry, even
 * when the author forgot to define an outcome for that dimension (the
 * dimension label is used as a fallback). In `scores` mode this returns [].
 */
export function matchQuizOutcomes(quiz: ParsedQuiz, scores: QuizScores): QuizOutcome[] {
  if (quiz.scoring === 'scores') return [];

  if (quiz.scoring === 'argmax') {
    let winner: QuizDimension | undefined;
    for (const dim of quiz.dimensions) {
      if (!winner || (scores[dim.id] ?? 0) > (scores[winner.id] ?? 0)) winner = dim;
    }
    if (!winner) return [];
    const outcome = quiz.outcomes.find((o) => o.id === winner.id);
    return [outcome ?? { id: winner.id, label: winner.label, conditions: [] }];
  }

  // ranges
  return quiz.outcomes.filter((outcome) =>
    outcome.conditions.length > 0 &&
    outcome.conditions.every((cond) => {
      const value = scores[cond.dimension] ?? 0;
      if (cond.min !== undefined && value < cond.min) return false;
      if (cond.max !== undefined && value > cond.max) return false;
      return true;
    })
  );
}

/**
 * Build the tags for a kind 7849 quiz result event.
 * Raw answers are only included when the user explicitly opted in.
 */
export function buildQuizResultTags(
  quiz: ParsedQuiz,
  scores: QuizScores,
  outcomes: QuizOutcome[],
  opts: { includeAnswers?: boolean; answers?: Record<string, string> } = {},
): string[][] {
  const bounds = quizDimensionBounds(quiz);
  const tags: string[][] = [
    ['a', quiz.address],
    ['e', quiz.event.id],
    ['p', quiz.event.pubkey],
  ];
  for (const outcome of outcomes) {
    const tag = ['outcome', outcome.id, outcome.label];
    if (outcome.image) tag.push(outcome.image);
    tags.push(tag);
  }
  for (const dim of quiz.dimensions) {
    const b = bounds[dim.id];
    tags.push(['score', dim.id, String(scores[dim.id] ?? 0), dim.label, String(b.min), String(b.max)]);
  }
  if (opts.includeAnswers && opts.answers) {
    for (const question of quiz.questions) {
      const optionId = opts.answers[question.id];
      if (optionId) tags.push(['answer', question.id, optionId]);
    }
  }
  const resultText = outcomes.length > 0
    ? outcomes.map((o) => o.label).join(', ')
    : quiz.dimensions.map((d) => `${d.label}: ${scores[d.id] ?? 0}`).join(', ');
  tags.push(['alt', `Quiz result: ${resultText} on "${quiz.title}"`]);
  return tags;
}

/**
 * Parse a quiz coordinate `37849:<pubkey>:<d>`. Validates the pubkey so the
 * result is safe to pass to filters and `naddrEncode`.
 */
export function parseQuizAddress(address: string | undefined): { pubkey: string; identifier: string } | undefined {
  if (!address) return undefined;
  const idx1 = address.indexOf(':');
  const idx2 = address.indexOf(':', idx1 + 1);
  if (idx1 < 0 || idx2 < 0) return undefined;
  const kind = address.slice(0, idx1);
  const pubkey = address.slice(idx1 + 1, idx2);
  const identifier = address.slice(idx2 + 1);
  if (kind !== String(QUIZ_KIND) || !isNostrId(pubkey)) return undefined;
  return { pubkey, identifier };
}

/**
 * Parse a kind 7849 quiz result. Returns `null` when the event doesn't carry
 * a valid quiz coordinate. Pubkeys and event ids are validated here so
 * renderers can trust them.
 */
export function parseQuizResult(event: NostrEvent): ParsedQuizResult | null {
  if (event.kind !== QUIZ_RESULT_KIND) return null;

  const address = event.tags.find(([n, v]) => n === 'a' && v?.startsWith(`${QUIZ_KIND}:`))?.[1];
  const addr = parseQuizAddress(address);
  if (!address || !addr) return null;

  const quizEventId = event.tags.find(([n]) => n === 'e')?.[1];

  const outcomes: { id: string; label: string; image?: string }[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'outcome') continue;
    const [, id, label, image] = tag;
    if (!id || !ID_RE.test(id)) continue;
    outcomes.push({ id, label: label?.trim() || id, image: sanitizeUrl(image) });
  }

  const scores: QuizResultScore[] = [];
  for (const tag of event.tags) {
    if (tag[0] !== 'score') continue;
    const [, dimension, rawValue, label, rawMin, rawMax] = tag;
    if (!dimension || !ID_RE.test(dimension)) continue;
    const value = parseFiniteNumber(rawValue);
    if (value === undefined) continue;
    scores.push({
      dimension,
      value,
      label: label?.trim() || undefined,
      min: parseFiniteNumber(rawMin),
      max: parseFiniteNumber(rawMax),
    });
  }

  const answers: Record<string, string> = {};
  for (const tag of event.tags) {
    if (tag[0] !== 'answer') continue;
    const [, questionId, optionId] = tag;
    if (!questionId || !optionId || !ID_RE.test(questionId) || !ID_RE.test(optionId)) continue;
    answers[questionId] = optionId;
  }

  return {
    event,
    address,
    quizPubkey: addr.pubkey,
    quizIdentifier: addr.identifier,
    quizEventId: quizEventId && isNostrId(quizEventId) ? quizEventId : undefined,
    outcomes,
    scores,
    answers,
    comment: event.content.trim(),
  };
}

/** True when the event parses as a renderable quiz result. */
export function isValidQuizResult(event: NostrEvent): boolean {
  return parseQuizResult(event) !== null;
}

/**
 * NIP-88-style dedupe: keep only the newest result per pubkey.
 * Input order is not assumed; output is sorted newest-first.
 */
export function latestResultPerPubkey(events: NostrEvent[]): NostrEvent[] {
  const byPubkey = new Map<string, NostrEvent>();
  for (const event of events) {
    const existing = byPubkey.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      byPubkey.set(event.pubkey, event);
    }
  }
  return [...byPubkey.values()].sort((a, b) => b.created_at - a.created_at);
}
