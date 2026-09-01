import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
} from '@blobbi-kit/core/blobbi';

// ─── Mocks ─────────────────────────────────────────────────────────────────
// The ceremony's pre-publish guard asks the relays whether this user already
// owns a Blobbi, so the relay response is the input we vary per test, and the
// published events are the observable output we assert on.

const query = vi.fn<(...args: unknown[]) => Promise<NostrEvent[]>>();
vi.mock('@nostrify/react', () => ({
  useNostr: () => ({ nostr: { query } }),
}));

const publishEvent = vi.fn<(t: { kind: number; tags?: string[][] }) => Promise<NostrEvent>>();
vi.mock('@/hooks/useNostrPublish', () => ({
  useNostrPublish: () => ({ mutateAsync: publishEvent }),
}));

let currentPubkey: string | undefined;
vi.mock('@/hooks/useCurrentUser', () => ({
  useCurrentUser: () => ({ user: currentPubkey ? { pubkey: currentPubkey } : undefined }),
}));

vi.mock('@/hooks/useAuthor', () => ({
  useAuthor: () => ({ data: undefined }),
}));

vi.mock('@/hooks/useToast', () => ({
  toast: vi.fn(),
  useToast: () => ({ toast: vi.fn() }),
}));

// The egg/blobbi artwork is irrelevant to the guard and pulls in heavy SVG
// renderers, so stub it out to keep these tests focused and fast.
vi.mock('@/blobbi/ui/BlobbiStageVisual', () => ({
  BlobbiStageVisual: () => null,
}));

import { BlobbiHatchingCeremony } from './BlobbiHatchingCeremony';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CREATED_AT = 1_700_000_000;

/** A fully-formed, valid Kind 31124 Blobbi owned by `pubkey`. */
function makeValidBlobbi(pubkey: string, petId = 'existing-pet'): NostrEvent {
  return {
    id: 'f'.repeat(64),
    pubkey,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: buildEggTags(pubkey, petId, CREATED_AT, 'Sparky'),
    content: '',
    sig: '0'.repeat(128),
  };
}

/**
 * An event that comes back from the same filter but is NOT a usable Blobbi —
 * it is missing the stage/state/last_interaction tags that make a Blobbi real.
 * A user holding only this owns no Blobbi and must still get their first egg.
 */
function makeUnusableBlobbi(pubkey: string): NostrEvent {
  return {
    id: 'e'.repeat(64),
    pubkey,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: [
      ['d', 'junk-entry'],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ],
    content: '',
    sig: '0'.repeat(128),
  };
}

const noop = () => {};

function renderCeremony(
  props: Partial<React.ComponentProps<typeof BlobbiHatchingCeremony>> = {},
) {
  const onComplete = vi.fn();
  const result = render(
    <BlobbiHatchingCeremony
      profile={null}
      updateProfileEvent={noop}
      updateCompanionEvent={noop}
      invalidateProfile={noop}
      invalidateCompanion={noop}
      setStoredSelectedD={noop}
      onComplete={onComplete}
      {...props}
    />,
  );
  return { ...result, onComplete };
}

/** Events the ceremony actually published, by kind. */
function publishedKinds() {
  return publishEvent.mock.calls.map(([t]) => t.kind);
}

/** Let the ceremony's deferred silent-setup run to completion. */
async function runSetup() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
}

// Each test uses its own pubkey: the ceremony keeps a module-level set of
// in-flight setups keyed by pubkey, so sharing one would leak between tests.
let pubkeySeed = 0;
function freshPubkey() {
  pubkeySeed += 1;
  return pubkeySeed.toString(16).padStart(64, 'a');
}

describe('BlobbiHatchingCeremony — automatic creation is guarded by a fresh relay check', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    query.mockReset();
    publishEvent.mockReset();
    publishEvent.mockImplementation(async (t) => ({
      id: 'd'.repeat(64),
      pubkey: currentPubkey ?? '',
      created_at: CREATED_AT,
      kind: t.kind,
      tags: t.tags ?? [],
      content: '',
      sig: '0'.repeat(128),
    }));
    currentPubkey = freshPubkey();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('publishes no egg when the relays report an existing valid Blobbi', async () => {
    query.mockResolvedValue([makeValidBlobbi(currentPubkey!)]);

    const { onComplete } = renderCeremony();
    await runSetup();

    // The decisive assertion: nothing was written to Nostr at all — no egg,
    // and no Blobbonaut profile either.
    expect(publishEvent).not.toHaveBeenCalled();
    // ...and the ceremony hands control back so the page can show the Blobbi
    // the user already owns.
    expect(onComplete).toHaveBeenCalled();
  });

  it('creates the first egg when the relays confirm the user owns no Blobbi', async () => {
    query.mockResolvedValue([]);

    renderCeremony();
    await runSetup();

    expect(publishedKinds()).toContain(KIND_BLOBBI_STATE);
    // A brand-new user also gets their Blobbonaut profile.
    expect(publishedKinds()).toContain(KIND_BLOBBONAUT_PROFILE);
  });

  it('still creates the first egg when the only stored event is not a usable Blobbi', async () => {
    // Proves the guard tests whether the user really owns a Blobbi rather than
    // just whether the filter returned any rows — otherwise a junk event would
    // permanently lock a new user out of ever getting an egg.
    query.mockResolvedValue([makeUnusableBlobbi(currentPubkey!)]);

    renderCeremony();
    await runSetup();

    expect(publishedKinds()).toContain(KIND_BLOBBI_STATE);
  });

  it('asks the relays before publishing, not after', async () => {
    // The guard is only authoritative if the existence check precedes the very
    // first write. If a publish ever happened first, a duplicate would already
    // exist by the time the answer arrived.
    let queryResolved = false;
    query.mockImplementation(async () => {
      queryResolved = true;
      return [];
    });
    publishEvent.mockImplementation(async (t) => {
      expect(queryResolved).toBe(true);
      return {
        id: 'd'.repeat(64),
        pubkey: currentPubkey!,
        created_at: CREATED_AT,
        kind: t.kind,
        tags: t.tags ?? [],
        content: '',
        sig: '0'.repeat(128),
      };
    });

    renderCeremony();
    await runSetup();

    expect(publishEvent).toHaveBeenCalled();
    expect(query).toHaveBeenCalled();
  });

  it('overrides a stale caller decision that the user is brand new', async () => {
    // The page decided "new user" from an empty cached collection and rendered
    // the ceremony with profile=null. The relays disagree. The relays win.
    query.mockResolvedValue([makeValidBlobbi(currentPubkey!)]);

    const { onComplete } = renderCeremony({ profile: null });
    await runSetup();

    expect(publishEvent).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalled();
  });

  it('does not re-create an egg for a ceremony started from an existing egg', async () => {
    // Resuming the ceremony on an egg the user already has must never mint a
    // second one, regardless of what the relays say.
    const existing = makeValidBlobbi(currentPubkey!);
    const { parseBlobbiEvent } = await import('@blobbi-kit/core/blobbi');
    const companion = parseBlobbiEvent(existing);
    expect(companion).toBeDefined();

    query.mockResolvedValue([]);

    renderCeremony({ existingCompanion: companion });
    await runSetup();

    expect(publishedKinds()).not.toContain(KIND_BLOBBI_STATE);
  });
});

describe('BlobbiHatchingCeremony — manual adoption is not blocked by the guard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    query.mockReset();
    publishEvent.mockReset();
    publishEvent.mockImplementation(async (t) => ({
      id: 'd'.repeat(64),
      pubkey: currentPubkey ?? '',
      created_at: CREATED_AT,
      kind: t.kind,
      tags: t.tags ?? [],
      content: '',
      sig: '0'.repeat(128),
    }));
    currentPubkey = freshPubkey();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adopts another egg for a user who already owns a valid Blobbi', async () => {
    // Adopting is an explicit, user-initiated action. The duplicate guard exists
    // to stop *silent* auto-creation, so it must not veto a deliberate adoption
    // — otherwise owning one Blobbi makes it impossible to ever get a second.
    query.mockResolvedValue([makeValidBlobbi(currentPubkey!)]);

    renderCeremony({ eggOnly: true, userInitiated: true });
    await runSetup();

    expect(publishedKinds()).toContain(KIND_BLOBBI_STATE);
  });
});
