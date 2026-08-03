import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SessionMessage } from '@soapbox.pub/nostr-canvas/devkit';
import {
  CODE_VERSION_TAG,
  CODE_VERSION_TAG_END,
  getCodeVersion,
  restoreCodeVersions,
  clearCodeVersions,
} from '@soapbox.pub/nostr-canvas/devkit';

import { getInFlightToolCall, getCodeBeforeToolCall } from '@/lib/agentActivity';

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

/** Build a write/edit tool result carrying a code version tag. */
function versionedResult(version: number, status = 'File written (1 lines).'): string {
  return `${status}\n${CODE_VERSION_TAG}${version}${CODE_VERSION_TAG_END}`;
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

describe('getCodeBeforeToolCall', () => {
  // The devkit code version store is a process-wide singleton, so every test
  // must start from a clean store.
  beforeEach(() => clearCodeVersions());
  afterEach(() => clearCodeVersions());

  it('returns undefined when no prior code-version tool message exists and no seed is given', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      assistantWithToolCalls([{ id: 'c1', name: 'edit_code' }]),
    ];
    expect(getCodeBeforeToolCall(messages, 'c1')).toBeUndefined();
  });

  it('returns the seed code when no prior code-version tool message exists', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      assistantWithToolCalls([{ id: 'c1', name: 'edit_code' }]),
    ];
    expect(getCodeBeforeToolCall(messages, 'c1', 'initial code')).toBe('initial code');
  });

  it('returns the seeded code for the most recent prior write', () => {
    restoreCodeVersions({ 0: 'the prior code' });
    expect(getCodeVersion(0)).toBe('the prior code');

    const messages: SessionMessage[] = [
      { role: 'user', content: 'write a function' },
      assistantWithToolCalls([{ id: 'call-write', name: 'write_code' }]),
      toolResult('call-write', versionedResult(0)),
      { role: 'user', content: 'now change it' },
      assistantWithToolCalls([{ id: 'call-edit', name: 'edit_code' }]),
    ];
    expect(getCodeBeforeToolCall(messages, 'call-edit')).toBe('the prior code');
  });

  it('returns the code of the most recent of two prior versions', () => {
    restoreCodeVersions({ 0: 'version 0 code', 1: 'version 1 code' });

    const messages: SessionMessage[] = [
      { role: 'user', content: 'first write' },
      assistantWithToolCalls([{ id: 'w1', name: 'write_code' }]),
      toolResult('w1', versionedResult(0)),
      { role: 'user', content: 'second write' },
      assistantWithToolCalls([{ id: 'w2', name: 'write_code' }]),
      toolResult('w2', versionedResult(1)),
      { role: 'user', content: 'now edit' },
      assistantWithToolCalls([{ id: 'edit1', name: 'edit_code' }]),
    ];
    expect(getCodeBeforeToolCall(messages, 'edit1')).toBe('version 1 code');
  });

  it('returns undefined for a tool call id that is not in the messages', () => {
    const messages: SessionMessage[] = [
      { role: 'user', content: 'hi' },
      assistantWithToolCalls([{ id: 'c1', name: 'write_code' }]),
      toolResult('c1', versionedResult(0)),
    ];
    expect(getCodeBeforeToolCall(messages, 'no-such-id')).toBeUndefined();
  });
});
