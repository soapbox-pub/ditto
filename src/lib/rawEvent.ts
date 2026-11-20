import { defineMessage, type IntlShape, type MessageDescriptor } from 'react-intl';
import type { NostrEvent } from '@nostrify/nostrify';
import { getEventHash } from 'nostr-tools/pure';

import type { EventTemplate } from '@/hooks/useNostrPublish';
import { isAddressableKind } from '@/lib/eventKinds';
import { shouldHideFeedEvent } from '@/lib/feedUtils';
import { getKindLabel, KIND_LABELS } from '@/lib/kindLabels';
import { isNostrId } from '@/lib/nostrId';

const errors = {
  json: defineMessage({ id: 'rawEvent.error.json', defaultMessage: 'Not valid JSON.' }),
  object: defineMessage({ id: 'rawEvent.error.object', defaultMessage: 'The event must be a JSON object.' }),
  kind: defineMessage({ id: 'rawEvent.error.kind', defaultMessage: '"kind" must be an integer between 0 and 65535.' }),
  content: defineMessage({ id: 'rawEvent.error.content', defaultMessage: '"content" must be a string.' }),
  tags: defineMessage({ id: 'rawEvent.error.tags', defaultMessage: '"tags" must be an array of arrays of strings.' }),
  createdAt: defineMessage({ id: 'rawEvent.error.createdAt', defaultMessage: '"created_at" must be a non-negative integer (Unix seconds).' }),
};

export type ParseResult = { template: EventTemplate } | { error: MessageDescriptor };

export interface Warning {
  message: MessageDescriptor;
  values?: Record<string, string>;
  /** Something wrong with the event, rather than a note about what publishing it does. */
  problem?: boolean;
}

const warnings = {
  unknownKind: defineMessage({ id: 'rawEvent.warning.unknownKind', defaultMessage: "Ditto doesn't recognize kind {kind}, so it won't display this event. Other apps might." }),
  hidden: defineMessage({ id: 'rawEvent.warning.hidden', defaultMessage: "This {label} is missing tags or content Ditto requires, so it won't show up in feeds." }),
  profileJson: defineMessage({ id: 'rawEvent.warning.profileJson', defaultMessage: 'Profile content should be a JSON object, like {example}. Anything else breaks your profile in most apps.' }),
  badId: defineMessage({ id: 'rawEvent.warning.badId', defaultMessage: 'A "{tag}" tag doesn\'t hold a 64-character hex id. Did you leave a placeholder in?' }),
  emptyFollows: defineMessage({ id: 'rawEvent.warning.emptyFollows', defaultMessage: 'This has no "p" tags, so it will empty your follow list.' }),
  missingD: defineMessage({ id: 'rawEvent.warning.missingD', defaultMessage: 'Kind {kind} is addressable but has no "d" tag. It will be stored under an empty "d", replacing any other event of yours published that way.' }),
  replaces: defineMessage({ id: 'rawEvent.warning.replaces', defaultMessage: 'This replaces your current {label}.' }),
  replacesAddress: defineMessage({ id: 'rawEvent.warning.replacesAddress', defaultMessage: 'This replaces your {label} with "d" tag "{d}", if you have one.' }),
};

const editErrors = {
  kind: defineMessage({ id: 'rawEvent.edit.error.kind', defaultMessage: 'An edit can\'t change "kind". To publish a different event, use Settings → Advanced.' }),
  d: defineMessage({ id: 'rawEvent.edit.error.d', defaultMessage: 'An edit can\'t change the "d" tag. To publish a different event, use Settings → Advanced.' }),
  createdAt: defineMessage({ id: 'rawEvent.edit.error.createdAt', defaultMessage: '"created_at" must be later than the current version, or relays will keep the old one.' }),
};

/** Tags whose first value is a hex event id or pubkey. */
const ID_TAGS = new Set(['e', 'E', 'p', 'P']);

/** Non-blocking problems with an otherwise valid template, from what Ditto knows about its kind. */
export function getWarnings(template: EventTemplate, intl: IntlShape): Warning[] {
  const { kind, content, tags } = template;
  const label = getKindLabel(intl, kind);
  const result: Warning[] = [];

  if (!KIND_LABELS[kind]) {
    result.push({ message: warnings.unknownKind, values: { kind: String(kind) } });
  }

  if (kind === 0) {
    let metadata: unknown;
    try {
      metadata = JSON.parse(content);
    } catch {
      // Reported below.
    }
    if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
      result.push({ message: warnings.profileJson, values: { example: '{"name": "…"}' }, problem: true });
    }
  } else if (KIND_LABELS[kind] && shouldHideFeedEvent({ ...template, created_at: template.created_at ?? 0, id: '', pubkey: '', sig: '' })) {
    result.push({ message: warnings.hidden, values: { label }, problem: true });
  }

  const badRef = tags.find(([name, value]) => ID_TAGS.has(name) && !isNostrId(value));
  if (badRef) {
    result.push({ message: warnings.badId, values: { tag: badRef[0] }, problem: true });
  }

  if (kind === 3 && !tags.some(([name, value]) => name === 'p' && value)) {
    result.push({ message: warnings.emptyFollows, problem: true });
  }

  if (isAddressableKind(kind)) {
    const d = tags.find(([name]) => name === 'd')?.[1];
    if (d === undefined) {
      result.push({ message: warnings.missingD, values: { kind: String(kind) } });
    } else {
      result.push({ message: warnings.replacesAddress, values: { label, d } });
    }
  } else if (kind === 0 || kind === 3 || (kind >= 10000 && kind < 20000)) {
    result.push({ message: warnings.replaces, values: { label } });
  }

  return result;
}

/**
 * Parse user-supplied JSON into an unsigned event template. `id`, `pubkey`
 * and `sig` are ignored since the event is re-signed by the current account.
 */
export function parseEventJson(text: string): ParseResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { error: errors.json };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { error: errors.object };
  }

  const { kind, content = '', tags = [], created_at } = value as Record<string, unknown>;

  if (typeof kind !== 'number' || !Number.isInteger(kind) || kind < 0 || kind > 65535) {
    return { error: errors.kind };
  }
  if (typeof content !== 'string') {
    return { error: errors.content };
  }
  if (!Array.isArray(tags) || !tags.every((tag) => Array.isArray(tag) && tag.every((v) => typeof v === 'string'))) {
    return { error: errors.tags };
  }
  if (created_at !== undefined && (typeof created_at !== 'number' || !Number.isInteger(created_at) || created_at < 0)) {
    return { error: errors.createdAt };
  }

  return {
    template: {
      kind,
      content,
      tags: tags as string[][],
      created_at: created_at ?? Math.floor(Date.now() / 1000),
    },
  };
}

/** The editable part of an event, as the raw editor shows it. */
export function eventToEditableJson(event: NostrEvent): string {
  return JSON.stringify({ kind: event.kind, content: event.content, tags: event.tags }, null, 2);
}

const dTag = (tags: string[][]) => tags.find(([name]) => name === 'd')?.[1] ?? '';

/**
 * Check an edit of `original`. An edit has to stay the same event, so it
 * keeps its kind and "d" tag and is newer than the original. It also can't
 * add a problem the original didn't have: those become errors, while
 * problems the original already had stay warnings, so an event that was
 * already broken can still be fixed one step at a time.
 */
export function checkEdit(
  template: EventTemplate,
  original: NostrEvent,
  intl: IntlShape,
): { errors: Warning[]; warnings: Warning[] } {
  if (template.kind !== original.kind) {
    return { errors: [{ message: editErrors.kind }], warnings: [] };
  }
  if (isAddressableKind(original.kind) && dTag(template.tags) !== dTag(original.tags)) {
    return { errors: [{ message: editErrors.d }], warnings: [] };
  }
  if (template.created_at !== undefined && template.created_at <= original.created_at) {
    return { errors: [{ message: editErrors.createdAt }], warnings: [] };
  }

  const before = new Set(getWarnings(original, intl).filter((w) => w.problem).map((w) => w.message.id));
  const problems = getWarnings(template, intl).filter((w) => w.problem);
  return {
    errors: problems.filter((w) => !before.has(w.message.id)),
    warnings: problems.filter((w) => before.has(w.message.id)),
  };
}

/**
 * The event as the feed would get it, for rendering with the feed's own card,
 * or undefined when Ditto wouldn't show it. Its id is the real hash of the
 * unsigned event, so lookups keyed on it are valid.
 */
export function buildPreviewEvent(template: EventTemplate, pubkey: string): NostrEvent | undefined {
  const { kind, content, tags, created_at } = template;
  const unsigned = { kind, content, tags, created_at: created_at ?? Math.floor(Date.now() / 1000), pubkey };
  const event = { ...unsigned, id: getEventHash(unsigned), sig: '' };
  return KIND_LABELS[kind] && !shouldHideFeedEvent(event) ? event : undefined;
}

/** Tags added and removed by an edit, compared as whole tags (a reordered list is no change). */
export function diffTags(before: string[][], after: string[][]): { added: string[][]; removed: string[][] } {
  const count = (tags: string[][]) => {
    const map = new Map<string, number>();
    for (const tag of tags) {
      const key = JSON.stringify(tag);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  };
  const left = count(before);
  const right = count(after);
  const added: string[][] = [];
  const removed: string[][] = [];
  for (const [key, n] of right) {
    for (let i = left.get(key) ?? 0; i < n; i++) added.push(JSON.parse(key));
  }
  for (const [key, n] of left) {
    for (let i = right.get(key) ?? 0; i < n; i++) removed.push(JSON.parse(key));
  }
  return { added, removed };
}
