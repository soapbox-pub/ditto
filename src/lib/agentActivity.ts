import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

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
