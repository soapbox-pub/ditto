import { describe, it, expect, beforeEach } from 'vitest';
import { AgentSession } from '@soapbox.pub/nostr-canvas/devkit';
import type { SerializedSession } from '@soapbox.pub/nostr-canvas/devkit';
import type OpenAI from 'openai';

import {
  getStoredTabs,
  getStoredTab,
  saveTab,
  removeTab,
  patchTabMetadata,
  saveTabAgent,
  pruneStaleTabs,
  isAtTabCap,
  MAX_OPEN_TABS,
  TAB_MAX_AGE_MS,
  type PersistedTab,
} from './chatTabsStorage';

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeSerializedSession(overrides: Partial<SerializedSession> = {}): SerializedSession {
  return {
    messages: [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ],
    pendingInput: null,
    pendingToolCalls: [],
    ...overrides,
  };
}

/** A tab record that includes a mid-flight ask_questions pause. */
function makePausedTab(overrides: Partial<PersistedTab> = {}): PersistedTab {
  const paused: SerializedSession = {
    messages: [
      { role: 'user', content: 'build me a tile' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: 'call-1',
          type: 'function',
          function: { name: 'ask_questions', arguments: JSON.stringify({ questions: ['what color?'] }) },
        }],
      },
    ],
    pendingInput: {
      requestId: 'req-1',
      toolCallId: 'call-1',
      toolName: 'ask_questions',
      data: { questions: ['what color?'] },
    },
    pendingToolCalls: [{ id: 'call-1', name: 'ask_questions', arguments: JSON.stringify({ questions: ['what color?'] }) }],
  };
  return {
    id: 'tab-1',
    title: '',
    abilities: ['nostr-lookup'],
    providerId: 'shakespeare',
    modelId: 'shakespeare/glm-4.5',
    createdAt: 1_000_000,
    updatedAt: 2_000_000,
    agent: paused,
    ...overrides,
  };
}

const stubClient = {} as unknown as OpenAI;

const PUBKEY_A = 'aa'.repeat(32);
const PUBKEY_B = 'bb'.repeat(32);

function makeAgent() {
  return new AgentSession({
    client: stubClient,
    modelId: 'glm-4.5',
    tools: [],
    systemPrompt: 'test',
    contextWindow: 10_000,
  });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('chatTabsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saveTab/getStoredTab round-trips a serialized session with a pending-input pause', () => {
    const tab = makePausedTab();
    saveTab(tab);

    const loaded = getStoredTab('tab-1');
    expect(loaded).not.toBeNull();
    expect(loaded).toEqual(tab);

    // The pending pause survives JSON persistence byte for byte.
    expect(loaded!.agent.pendingInput).toEqual(tab.agent.pendingInput);
    expect(loaded!.agent.pendingToolCalls).toEqual(tab.agent.pendingToolCalls);
    expect(loaded!.agent.messages).toHaveLength(2);
    expect(loaded!.agent.messages[1]).toMatchObject({ role: 'assistant', tool_calls: [{ id: 'call-1' }] });
  });

  it('serialize/deserialize round-trips a paused AgentSession through storage', () => {
    const tab = makePausedTab();
    saveTab(tab);

    // A fresh page load reconstructs the tab's AgentSession from the blob.
    const loaded = getStoredTab('tab-1')!;
    const agent = makeAgent();
    agent.deserialize(loaded.agent);

    const snapshot = agent.getSnapshot();
    expect(snapshot.messages).toEqual(tab.agent.messages);
    expect(snapshot.pendingInput).toEqual(tab.agent.pendingInput);

    // Reserializing reproduces the same state, so a second reload is lossless.
    expect(agent.serialize()).toEqual(tab.agent);
  });

  it('getStoredTabs lists every stored tab and skips malformed entries', () => {
    saveTab(makePausedTab({ id: 'tab-1' }));
    saveTab(makePausedTab({ id: 'tab-2', abilities: [], modelId: 'shakespeare/x' }));
    localStorage.setItem('ditto.ai-chat.tab.v1.anon.broken', '{not json');
    localStorage.setItem('unrelated-key', 'hello');

    const tabs = getStoredTabs();
    expect(tabs.map((t) => t.id)).toEqual(['tab-1', 'tab-2']);
  });

  it('getStoredTabs drops parseable records that are missing required fields', () => {
    saveTab(makePausedTab({ id: 'valid-1' }));
    // Parseable JSON, but each record lacks a field tabToSession depends on.
    localStorage.setItem(
      'ditto.ai-chat.tab.v1.anon.no-created-at',
      JSON.stringify({ id: 'no-created-at', title: '', abilities: [], providerId: 'shakespeare', modelId: 'm', updatedAt: 1, agent: makePausedTab().agent }),
    );
    localStorage.setItem(
      'ditto.ai-chat.tab.v1.anon.no-abilities',
      JSON.stringify({ id: 'no-abilities', title: '', abilities: 'not-an-array', providerId: 'shakespeare', modelId: 'm', createdAt: 1, updatedAt: 1, agent: makePausedTab().agent }),
    );
    localStorage.setItem(
      'ditto.ai-chat.tab.v1.anon.no-provider',
      JSON.stringify({ id: 'no-provider', title: '', abilities: [], modelId: 'm', createdAt: 1, updatedAt: 1, agent: makePausedTab().agent }),
    );
    localStorage.setItem(
      'ditto.ai-chat.tab.v1.anon.no-model',
      JSON.stringify({ id: 'no-model', title: '', abilities: [], providerId: 'shakespeare', createdAt: 1, updatedAt: 1, agent: makePausedTab().agent }),
    );

    const tabs = getStoredTabs();
    expect(tabs.map((t) => t.id)).toEqual(['valid-1']);
  });

  it('getStoredTab returns null for a parseable but malformed record', () => {
    localStorage.setItem(
      'ditto.ai-chat.tab.v1.anon.bad',
      JSON.stringify({ id: 'bad', title: '', abilities: [], providerId: 'shakespeare', modelId: 'm', createdAt: 'not-a-number', updatedAt: 1, agent: makePausedTab().agent }),
    );
    expect(getStoredTab('bad')).toBeNull();
    expect(getStoredTab('missing')).toBeNull();
  });

  it('patchTabMetadata updates metadata and preserves the agent blob', () => {
    saveTab(makePausedTab());

    const patched = patchTabMetadata('tab-1', { title: 'My title', modelId: 'shakespeare/other' }, 'anon', 3_000_000);
    expect(patched?.title).toBe('My title');
    expect(patched?.modelId).toBe('shakespeare/other');
    expect(patched?.updatedAt).toBe(3_000_000);
    // The blob (including the pause) is untouched by a metadata write.
    expect(patched?.agent).toEqual(makePausedTab().agent);
  });

  it('saveTabAgent updates the blob and preserves metadata', () => {
    saveTab(makePausedTab());

    const resumed = makeSerializedSession({ messages: [{ role: 'user', content: 'red' }] });
    const patched = saveTabAgent('tab-1', resumed, 'anon', 4_000_000);
    expect(patched?.agent).toEqual(resumed);
    expect(patched?.title).toBe('');
    expect(patched?.abilities).toEqual(['nostr-lookup']);
    expect(patched?.providerId).toBe('shakespeare');
    expect(patched?.updatedAt).toBe(4_000_000);
  });

  it('saveTabAgent returns null when no tab is stored', () => {
    expect(saveTabAgent('missing', makeSerializedSession())).toBeNull();
  });

  it('removeTab hard-deletes the stored entry', () => {
    saveTab(makePausedTab());
    removeTab('tab-1');
    expect(getStoredTab('tab-1')).toBeNull();
    expect(getStoredTabs()).toHaveLength(0);
  });

  it('pruneStaleTabs deletes tabs untouched for 30 days and keeps fresh ones', () => {
    const now = 10_000_000;
    saveTab(makePausedTab({ id: 'old', updatedAt: now - TAB_MAX_AGE_MS - 1 }));
    saveTab(makePausedTab({ id: 'exactly-cutoff', updatedAt: now - TAB_MAX_AGE_MS }));
    saveTab(makePausedTab({ id: 'fresh', updatedAt: now - TAB_MAX_AGE_MS + 1 }));

    const removed = pruneStaleTabs('anon', now);
    expect(removed.sort()).toEqual(['exactly-cutoff', 'old']);
    expect(getStoredTab('old')).toBeNull();
    expect(getStoredTab('exactly-cutoff')).toBeNull();
    expect(getStoredTab('fresh')).not.toBeNull();
  });

  it('pruneStaleTabs is a no-op when nothing is stale', () => {
    saveTab(makePausedTab({ id: 'fresh', updatedAt: Date.now() }));
    expect(pruneStaleTabs()).toEqual([]);
    expect(getStoredTabs()).toHaveLength(1);
  });

  it('isAtTabCap triggers only at the 20-tab cap', () => {
    expect(isAtTabCap(MAX_OPEN_TABS - 1)).toBe(false);
    expect(isAtTabCap(MAX_OPEN_TABS)).toBe(true);
    expect(isAtTabCap(MAX_OPEN_TABS + 1)).toBe(true);
  });

  it('isolates tabs per pubkey: a tab saved under pubkey A is invisible under pubkey B', () => {
    const tabA = makePausedTab({ id: 'tab-1', title: 'A chat' });
    saveTab(tabA, PUBKEY_A);

    expect(getStoredTab('tab-1', PUBKEY_A)).toEqual(tabA);
    expect(getStoredTab('tab-1', PUBKEY_B)).toBeNull();
    expect(getStoredTab('tab-1')).toBeNull(); // not in the anon scope either
    expect(getStoredTabs(PUBKEY_A)).toEqual([tabA]);
    expect(getStoredTabs(PUBKEY_B)).toEqual([]);
  });

  it('keeps each account tab list separate when both accounts have tabs', () => {
    saveTab(makePausedTab({ id: 'a-1' }), PUBKEY_A);
    saveTab(makePausedTab({ id: 'b-1' }), PUBKEY_B);
    saveTab(makePausedTab({ id: 'anon-1' }));

    expect(getStoredTabs(PUBKEY_A).map((t) => t.id)).toEqual(['a-1']);
    expect(getStoredTabs(PUBKEY_B).map((t) => t.id)).toEqual(['b-1']);
    expect(getStoredTabs().map((t) => t.id)).toEqual(['anon-1']);
  });

  it('removeTab deletes only the tab in the given pubkey scope', () => {
    saveTab(makePausedTab({ id: 'tab-1' }), PUBKEY_A);
    saveTab(makePausedTab({ id: 'tab-1' }), PUBKEY_B);

    removeTab('tab-1', PUBKEY_A);

    expect(getStoredTab('tab-1', PUBKEY_A)).toBeNull();
    expect(getStoredTab('tab-1', PUBKEY_B)).not.toBeNull();
  });

  it('patchTabMetadata and saveTabAgent write within the given pubkey scope', () => {
    saveTab(makePausedTab({ id: 'tab-1' }), PUBKEY_A);
    saveTab(makePausedTab({ id: 'tab-1' }), PUBKEY_B);

    const patched = patchTabMetadata('tab-1', { title: 'A title' }, PUBKEY_A, 3_000_000);
    expect(patched?.title).toBe('A title');
    expect(getStoredTab('tab-1', PUBKEY_B)?.title).toBe('');

    const resumed = makeSerializedSession({ messages: [{ role: 'user', content: 'red' }] });
    const saved = saveTabAgent('tab-1', resumed, PUBKEY_A, 4_000_000);
    expect(saved?.agent).toEqual(resumed);
    expect(getStoredTab('tab-1', PUBKEY_B)?.agent).toEqual(makePausedTab().agent);
  });

  it('pruneStaleTabs prunes only tabs in the given pubkey scope', () => {
    const now = 10_000_000;
    saveTab(makePausedTab({ id: 'old-a', updatedAt: now - TAB_MAX_AGE_MS - 1 }), PUBKEY_A);
    saveTab(makePausedTab({ id: 'old-b', updatedAt: now - TAB_MAX_AGE_MS - 1 }), PUBKEY_B);
    saveTab(makePausedTab({ id: 'fresh-a', updatedAt: now - 1 }), PUBKEY_A);

    const removed = pruneStaleTabs(PUBKEY_A, now);
    expect(removed).toEqual(['old-a']);
    expect(getStoredTab('old-a', PUBKEY_A)).toBeNull();
    expect(getStoredTab('old-b', PUBKEY_B)).not.toBeNull();
    expect(getStoredTabs(PUBKEY_A).map((t) => t.id)).toEqual(['fresh-a']);
  });
});
