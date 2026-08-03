import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';
import {
  CODE_VERSION_TAG,
  parseCodeVersionTag,
  getCodeVersion,
} from '@soapbox.pub/nostr-canvas/devkit';

/**
 * The tool call the agent is currently waiting on: the first call of the last
 * assistant message that carried tool calls whose result has not arrived yet.
 * A call counts as answered when a later `role: 'tool'` message references
 * its id. Returns `null` when every call is answered or no call exists.
 */
export function getInFlightToolCall(messages: SessionMessage[]): { id: string; name: string } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    for (const call of msg.tool_calls ?? []) {
      if (call.type !== 'function') continue;
      const answered = messages.some((m, j) => j > i && m.role === 'tool' && m.tool_call_id === call.id);
      if (!answered) return { id: call.id, name: call.function.name };
    }
  }
  return null;
}

/**
 * The code the file held just before the given tool call ran. Walks backward
 * from the tool call's assistant message to the most recent prior
 * `role: 'tool'` result carrying a devkit code-version tag and resolves that
 * version through devkit's version store. Falls back to `seedCode` when no
 * prior version exists, `undefined` when the call id is not in the list.
 */
export function getCodeBeforeToolCall(
  messages: SessionMessage[],
  toolCallId: string,
  seedCode?: string,
): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== 'assistant') continue;
    const carriesCall = (msg.tool_calls ?? []).some((tc) => tc.id === toolCallId);
    if (!carriesCall) continue;

    for (let j = i - 1; j >= 0; j--) {
      const prev = messages[j];
      if (prev.role !== 'tool') continue;
      const content = typeof prev.content === 'string' ? prev.content : '';
      if (!content.includes(CODE_VERSION_TAG)) continue;
      const version = parseCodeVersionTag(content);
      if (version === null) continue;
      const code = getCodeVersion(version);
      if (code !== undefined) return code;
    }
    return seedCode;
  }
  return undefined;
}
