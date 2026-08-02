import { isCompactionMarker } from '@soapbox.pub/nostr-canvas/devkit';
import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

/** Maximum length of a generated title, in characters. */
const TITLE_MAX_LENGTH = 60;

/** Turns to include in the titling prompt, newest last. */
const PROMPT_TURNS = 12;

/** Max characters of a single turn fed to the titler. */
const TURN_MAX_LENGTH = 300;

/**
 * True once a session has a complete first exchange: at least one user message
 * and at least one assistant message with real content (tool-call-only
 * assistant messages do not count as a reply).
 */
export function isFirstExchangeComplete(messages: SessionMessage[]): boolean {
  let hasUser = false;
  let hasAssistantContent = false;
  for (const msg of messages) {
    if (isCompactionMarker(msg)) continue;
    if (msg.role === 'user' && typeof msg.content === 'string' && msg.content.length > 0) hasUser = true;
    if (msg.role === 'assistant' && typeof msg.content === 'string' && msg.content.length > 0) hasAssistantContent = true;
    if (hasUser && hasAssistantContent) return true;
  }
  return false;
}

/**
 * Build the titling prompt from the session's messages: the last few
 * user/assistant turns, newest last. Tool traffic is excluded.
 */
export function buildTitlePrompt(messages: SessionMessage[]): string {
  const turns = messages
    .filter((msg): msg is SessionMessage & { content: string } =>
      !isCompactionMarker(msg) &&
      (msg.role === 'user' || msg.role === 'assistant') &&
      typeof msg.content === 'string' &&
      msg.content.length > 0,
    )
    .slice(-PROMPT_TURNS)
    .map((msg) => `${msg.role}: ${msg.content.slice(0, TURN_MAX_LENGTH)}`);

  return `Write a short title for this chat conversation, 4 words or fewer. Reply with the title only, no quotes.\n\n${turns.join('\n')}`;
}

/** Clamp a raw model reply into a tab title. */
export function cleanTitle(raw: string): string {
  return raw.trim().replace(/^["'“”]+|["'“”]+$/g, '').slice(0, TITLE_MAX_LENGTH);
}
