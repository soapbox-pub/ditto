import { describe, it, expect } from 'vitest';
import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';

import { getInFlightToolCall } from '@/lib/agentActivity';

/**
 * Build an assistant message carrying the given tool calls. A tool-call-only
 * round has empty content.
 */
function assistantWithToolCalls(
  calls: { id: string; name: string }[],
  content: string | null = null,
): SessionMessage {
  return {
    role: 'assistant',
    content,
    tool_calls: calls.map((call) => ({
      id: call.id,
      type: 'function' as const,
      function: { name: call.name, arguments: '{}' },
    })),
  };
}

/** Build the role:'tool' message that answers a tool call. */
function toolResult(callId: string, content = 'ok'): SessionMessage {
  return { role: 'tool', tool_call_id: callId, content };
}

const userMessage: SessionMessage = { role: 'user', content: 'hi' };
const plainReply: SessionMessage = { role: 'assistant', content: 'hello' };

describe('getInFlightToolCall', () => {
  it('returns null for an empty message list', () => {
    expect(getInFlightToolCall([])).toBeNull();
  });

  it('returns null when the last assistant message has no tool calls', () => {
    expect(getInFlightToolCall([userMessage, plainReply])).toBeNull();
  });

  it('returns a tool call whose result has not arrived yet', () => {
    const messages = [userMessage, assistantWithToolCalls([{ id: 'c1', name: 'nak' }])];
    expect(getInFlightToolCall(messages)).toEqual({ id: 'c1', name: 'nak' });
  });

  it('returns null when the tool call has a matching result', () => {
    const messages = [
      userMessage,
      assistantWithToolCalls([{ id: 'c1', name: 'nak' }]),
      toolResult('c1'),
    ];
    expect(getInFlightToolCall(messages)).toBeNull();
  });

  it('returns the unresolved call when only one of two calls is answered', () => {
    const messages = [
      userMessage,
      assistantWithToolCalls([
        { id: 'c1', name: 'nak' },
        { id: 'c2', name: 'set_theme' },
      ]),
      toolResult('c1'),
    ];
    expect(getInFlightToolCall(messages)).toEqual({ id: 'c2', name: 'set_theme' });
  });

  it('returns null when a resolved tool round is followed by a plain reply', () => {
    const messages = [
      userMessage,
      assistantWithToolCalls([{ id: 'c1', name: 'nak' }]),
      toolResult('c1'),
      plainReply,
    ];
    expect(getInFlightToolCall(messages)).toBeNull();
  });
});
