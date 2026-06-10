import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
  parseBlobbiEvent,
  type BlobbiCompanion,
} from '../lib/blobbi';
import { useSeedIdentitySync } from './useSeedIdentitySync';

// Control relay + publish.
const query = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>(() => Promise.resolve([]));
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

const publishEvent = vi.fn<(...args: unknown[]) => Promise<NostrEvent>>();
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ mutateAsync: publishEvent }),
}));

const PUBKEY = 'a'.repeat(64);
const PET_ID = '0123456789';
const CREATED_AT = 1_700_000_000;
const OLD_APP_D = 'blobbi-feb88e80a63d-24a46c4828';

/**
 * Old-app event with a canonical-looking d-tag, a valid seed, but mismatched
 * mirror visual tags (so it WOULD trigger seed-identity sync if it weren't
 * classified as unsupported) plus old-app schema markers.
 */
function makeOldAppCompanion(): BlobbiCompanion {
  const seed = 'a'.repeat(64);
  const event: NostrEvent = {
    id: 'd'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: [
      ['d', OLD_APP_D],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
      ['name', 'Blobbi'],
      ['stage', 'egg'],
      ['state', 'active'],
      ['seed', seed],
      ['last_interaction', CREATED_AT.toString()],
      // Stale/mismatched mirror tags (would normally trigger seed-sync):
      ['base_color', '#000000'],
      ['pattern', 'spotted'],
      // Old-app schema markers → unsupported:
      ['incubation_time', '3600'],
      ['egg_temperature', '37'],
      ['t', 'blobbi'],
      ['client', 'blobbi'],
    ],
    content: '',
    sig: '0'.repeat(128),
  };
  const parsed = parseBlobbiEvent(event);
  if (!parsed) throw new Error('old-app fixture did not parse');
  return parsed;
}

/** A current Ditto canonical egg whose stored mirror tags are stale. */
function makeCanonicalCompanionNeedingSync(): BlobbiCompanion {
  const tags = buildEggTags(PUBKEY, PET_ID, CREATED_AT, 'Sparky').map((t) =>
    t[0] === 'base_color' ? ['base_color', '#000000'] : t,
  );
  const event: NostrEvent = {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags,
    content: '',
    sig: '0'.repeat(128),
  };
  const parsed = parseBlobbiEvent(event);
  if (!parsed) throw new Error('canonical fixture did not parse');
  return parsed;
}

describe('useSeedIdentitySync — skips unsupported old-app companions', () => {
  beforeEach(() => {
    query.mockReset();
    query.mockResolvedValue([]);
    publishEvent.mockReset();
    publishEvent.mockResolvedValue({} as NostrEvent);
  });

  it('does not query relays or publish for an old-app (canonical-looking) companion', async () => {
    const companion = makeOldAppCompanion();
    // Sanity: this companion is flagged legacy and would otherwise want a sync.
    expect(companion.isLegacy).toBe(true);

    renderHook(() => useSeedIdentitySync([companion], vi.fn()));

    await new Promise((r) => setTimeout(r, 20));

    expect(query).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it('still processes a current canonical companion that needs seed-identity sync', async () => {
    const companion = makeCanonicalCompanionNeedingSync();
    expect(companion.isLegacy).toBe(false);
    expect(companion.needsSeedIdentitySync).toBe(true);

    // Relay returns the same event as the freshest version.
    query.mockResolvedValue([companion.event]);
    publishEvent.mockResolvedValue(companion.event);

    renderHook(() => useSeedIdentitySync([companion], vi.fn()));

    // It fetches fresh then publishes the seed-mirrored repair.
    await new Promise((r) => setTimeout(r, 20));

    expect(query).toHaveBeenCalled();
    expect(publishEvent).toHaveBeenCalled();
  });
});
