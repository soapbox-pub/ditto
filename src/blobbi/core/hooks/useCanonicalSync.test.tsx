import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '../lib/blobbi';
import { useCanonicalSync } from './useCanonicalSync';

// Spy on the publish mutation.
const publishEvent = vi.fn<(...args: unknown[]) => Promise<NostrEvent>>();
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ mutateAsync: publishEvent }),
}));

const PUBKEY = 'a'.repeat(64);
const PET_ID = '0123456789';
const CREATED_AT = 1_700_000_000;

function makeCanonicalEvent(): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky'),
    content: '',
    sig: '0'.repeat(128),
  };
}

/**
 * A canonical event whose last_decay_at is far in the past, so the decay-only
 * sync exceeds MIN_DECAY_ELAPSED_SECONDS and proceeds to call
 * ensureCanonicalBeforeAction even with no pending interactions.
 */
function makeStaleCanonicalEvent(): NostrEvent {
  const longAgo = Math.floor(Date.now() / 1000) - 86_400; // 1 day ago
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky').map((t) =>
    t[0] === 'last_decay_at' ? ['last_decay_at', String(longAgo)] : t,
  );
  // buildEggTags may not include last_decay_at; ensure it is present.
  if (!tags.some(([n]) => n === 'last_decay_at')) {
    tags.push(['last_decay_at', String(longAgo)]);
  }
  return {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

function makeLegacyEvent(): NostrEvent {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Puck')
    .filter(([name]) => name !== 'seed' && name !== 'name')
    .map((t) => (t[0] === 'd' ? ['d', 'blobbi-puck'] : t));
  return {
    id: 'e'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
}

function makeCompanion(event: NostrEvent): BlobbiCompanion {
  const parsed = parseBlobbiEvent(event);
  if (!parsed) throw new Error('fixture did not parse');
  return parsed;
}

/**
 * Old-app event with a canonical-looking d-tag + a valid seed, but carrying
 * old-app schema markers (so isLegacy === true even though the d-tag is
 * canonical). Has a stale last_decay_at so it WOULD sync if not excluded.
 */
function makeOldAppEvent(): NostrEvent {
  const longAgo = Math.floor(Date.now() / 1000) - 86_400;
  return {
    id: 'd'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: [
      ['d', 'blobbi-feb88e80a63d-24a46c4828'],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
      ['name', 'Blobbi'],
      ['stage', 'egg'],
      ['state', 'active'],
      ['seed', 'a'.repeat(64)],
      ['last_interaction', CREATED_AT.toString()],
      ['last_decay_at', String(longAgo)],
      ['incubation_time', '3600'],
      ['egg_temperature', '37'],
      ['t', 'blobbi'],
      ['client', 'blobbi'],
    ],
    content: '',
    sig: '0'.repeat(128),
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useCanonicalSync — never publishes for legacy companions', () => {
  beforeEach(() => {
    publishEvent.mockReset();
    publishEvent.mockResolvedValue(makeCanonicalEvent());
  });

  it('does not call ensureCanonicalBeforeAction or publish for a legacy companion', async () => {
    const ensureCanonicalBeforeAction = vi.fn().mockResolvedValue(null);

    renderHook(
      () =>
        useCanonicalSync({
          companion: makeCompanion(makeLegacyEvent()),
          interactions: [],
          interactionsLoading: false,
          updateCompanionEvent: vi.fn(),
          ensureCanonicalBeforeAction,
        }),
      { wrapper },
    );

    // Give the effect a chance to (not) run.
    await new Promise((r) => setTimeout(r, 20));

    expect(ensureCanonicalBeforeAction).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('does not sync an old-app companion with a canonical-looking d-tag and stale decay', async () => {
    const companion = makeCompanion(makeOldAppEvent());
    // Sanity: flagged legacy despite canonical d-tag + valid seed.
    expect(companion.isLegacy).toBe(true);

    const ensureCanonicalBeforeAction = vi.fn().mockResolvedValue(null);

    renderHook(
      () =>
        useCanonicalSync({
          companion,
          interactions: [],
          interactionsLoading: false,
          updateCompanionEvent: vi.fn(),
          ensureCanonicalBeforeAction,
        }),
      { wrapper },
    );

    await new Promise((r) => setTimeout(r, 20));

    expect(ensureCanonicalBeforeAction).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('runs the sync for a canonical companion (ensureCanonicalBeforeAction is called)', async () => {
    // Return null from ensure so the sync stops before publishing — we only
    // need to prove the legacy guard does not block canonical companions.
    const ensureCanonicalBeforeAction = vi.fn().mockResolvedValue(null);

    renderHook(
      () =>
        useCanonicalSync({
          companion: makeCompanion(makeStaleCanonicalEvent()),
          interactions: [],
          interactionsLoading: false,
          updateCompanionEvent: vi.fn(),
          ensureCanonicalBeforeAction,
        }),
      { wrapper },
    );

    await waitFor(() => expect(ensureCanonicalBeforeAction).toHaveBeenCalled());
  });
});
