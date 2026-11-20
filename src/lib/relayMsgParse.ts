import type { NostrEvent, NostrRelayMsg } from '@nostrify/nostrify';

/**
 * Hand-written replacement for `NRelay1.msgSchema`, the zod schema every relay
 * frame is parsed with. Same verdicts as `NSchema.json().pipe(NSchema.relayMsg())`
 * (accepted events carry only the seven NIP-01 fields), at a fraction of the
 * cost: zod showed up in profiles of media feeds, which take hundreds of frames
 * a load.
 */

type Result = { success: true; data: NostrRelayMsg } | { success: false; error: Error };

const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

const isNonNegInt = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

function parseEvent(v: unknown): NostrEvent | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  const { id, kind, pubkey, tags, content, created_at, sig } = v as Record<string, unknown>;
  if (typeof id !== 'string' || !HEX64.test(id)) return undefined;
  if (!isNonNegInt(kind) || kind > 65535) return undefined;
  if (typeof pubkey !== 'string' || !HEX64.test(pubkey)) return undefined;
  if (!Array.isArray(tags)) return undefined;
  for (const tag of tags) {
    if (!Array.isArray(tag)) return undefined;
    for (const item of tag) if (typeof item !== 'string') return undefined;
  }
  if (typeof content !== 'string') return undefined;
  if (!isNonNegInt(created_at)) return undefined;
  if (typeof sig !== 'string' || !HEX128.test(sig)) return undefined;
  return { id, kind, pubkey, tags: tags as string[][], content, created_at, sig };
}

function parseMsg(m: unknown): NostrRelayMsg | undefined {
  if (!Array.isArray(m) || m.length === 0) return undefined;
  switch (m[0]) {
    case 'EVENT': {
      if (m.length !== 3 || typeof m[1] !== 'string') return undefined;
      const event = parseEvent(m[2]);
      return event && ['EVENT', m[1], event];
    }
    case 'OK':
      if (m.length !== 4 || typeof m[1] !== 'string' || !HEX64.test(m[1])) return undefined;
      if (typeof m[2] !== 'boolean' || typeof m[3] !== 'string') return undefined;
      return ['OK', m[1], m[2], m[3]];
    case 'EOSE':
      return m.length === 2 && typeof m[1] === 'string' ? ['EOSE', m[1]] : undefined;
    case 'NOTICE':
      return m.length === 2 && typeof m[1] === 'string' ? ['NOTICE', m[1]] : undefined;
    case 'CLOSED':
      return m.length === 3 && typeof m[1] === 'string' && typeof m[2] === 'string'
        ? ['CLOSED', m[1], m[2]]
        : undefined;
    case 'AUTH':
      return m.length === 2 && typeof m[1] === 'string' ? ['AUTH', m[1]] : undefined;
    case 'COUNT': {
      if (m.length !== 3 || typeof m[1] !== 'string') return undefined;
      const body = m[2];
      if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
      const { count, approximate } = body as Record<string, unknown>;
      if (!isNonNegInt(count)) return undefined;
      if (approximate !== undefined && typeof approximate !== 'boolean') return undefined;
      return ['COUNT', m[1], approximate === undefined ? { count } : { count, approximate }];
    }
    default:
      return undefined;
  }
}

/** `NRelay1.msgSchema`'s surface: `safeParse` over the raw frame text. */
export const relayMsgSchema = {
  safeParse(data: unknown): Result {
    if (typeof data !== 'string') return { success: false, error: new Error('not a string') };
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
    }
    const msg = parseMsg(json);
    return msg ? { success: true, data: msg } : { success: false, error: new Error('not a relay message') };
  },
};
