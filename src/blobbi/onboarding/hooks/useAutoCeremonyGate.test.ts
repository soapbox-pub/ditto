import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { NostrEvent } from '@nostrify/nostrify';

import {
  KIND_BLOBBI_STATE,
  KIND_BLOBBONAUT_PROFILE,
  BLOBBI_ECOSYSTEM_NAMESPACE,
  buildEggTags,
  parseBlobbiEvent,
  parseBlobbonautEvent,
  type BlobbiCompanion,
  type BlobbonautProfile,
} from '@blobbi-kit/core/blobbi';

import { useAutoCeremonyGate, type AutoCeremonyGateInput } from './useAutoCeremonyGate';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PUBKEY = 'a'.repeat(64);
const CREATED_AT = 1_700_000_000;

function makeProfile(): BlobbonautProfile {
  const event: NostrEvent = {
    id: 'b'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBONAUT_PROFILE,
    tags: [
      ['d', `blobbonaut-${PUBKEY.slice(0, 12)}`],
      ['b', BLOBBI_ECOSYSTEM_NAMESPACE],
    ],
    content: '',
    sig: '0'.repeat(128),
  };
  const parsed = parseBlobbonautEvent(event);
  if (!parsed) throw new Error('profile fixture did not parse');
  return parsed;
}

function makeCompanion(): BlobbiCompanion {
  const event: NostrEvent = {
    id: 'f'.repeat(64),
    pubkey: PUBKEY,
    created_at: CREATED_AT,
    kind: KIND_BLOBBI_STATE,
    tags: buildEggTags(PUBKEY, 'pet-1', CREATED_AT, 'Sparky'),
    content: '',
    sig: '0'.repeat(128),
  };
  const parsed = parseBlobbiEvent(event);
  if (!parsed) throw new Error('companion fixture did not parse');
  return parsed;
}

/** A logged-in user whose data has all arrived and confirms they own nothing. */
function confirmedNewUser(): AutoCeremonyGateInput {
  return {
    pubkey: PUBKEY,
    profile: null,
    profileSettled: true,
    companions: [],
    collectionLoading: false,
    collectionFetching: false,
    collectionError: null,
  };
}

function renderGate(input: AutoCeremonyGateInput) {
  return renderHook((props: AutoCeremonyGateInput) => useAutoCeremonyGate(props), {
    initialProps: input,
  });
}

// ─── Behaviour 1: never auto-create on unconfirmed data ──────────────────────

describe('useAutoCeremonyGate — a Blobbi is auto-created only for a confirmed-new user', () => {
  it('withholds the ceremony while the profile query is still in flight', () => {
    // No profile *yet* is not the same as no profile. Acting on it hands a
    // returning Blobbonaut a duplicate.
    const { result } = renderGate({ ...confirmedNewUser(), profileSettled: false });

    expect(result.current.definitelyNeedsCeremony).toBe(false);
  });

  it('starts the ceremony only after the profile query confirms the user has none', () => {
    const { result, rerender } = renderGate({
      ...confirmedNewUser(),
      profileSettled: false,
    });

    expect(result.current.definitelyNeedsCeremony).toBe(false);

    // The query comes back, successfully, with nothing.
    rerender(confirmedNewUser());

    expect(result.current.definitelyNeedsCeremony).toBe(true);
  });

  it('never treats a user who already has a profile as new', () => {
    const { result } = renderGate({
      ...confirmedNewUser(),
      profile: makeProfile(),
    });

    expect(result.current.definitelyNeedsCeremony).toBe(false);
  });

  it('keeps withholding the ceremony for a logged-out visitor', () => {
    const { result } = renderGate({
      ...confirmedNewUser(),
      pubkey: undefined,
    });

    // Nothing may be created on someone's behalf before we know who they are.
    expect(result.current.companionDataReady).toBe(false);
  });
});

// ─── Behaviour 2: an unavailable list is not an empty list ───────────────────

describe('useAutoCeremonyGate — an unavailable companion list is not mistaken for an empty one', () => {
  it('does not treat a query disabled by a missing pubkey as a settled empty collection', () => {
    // The collection query stays disabled until a pubkey exists, and a disabled
    // query reports "not loading" — indistinguishable from a genuine empty
    // result unless the pubkey is checked.
    const { result } = renderGate({
      ...confirmedNewUser(),
      pubkey: undefined,
      collectionLoading: false,
      collectionFetching: false,
      collectionError: null,
    });

    expect(result.current.companionDataReady).toBe(false);
  });

  it('starts trusting the collection once the user is known', () => {
    const { result, rerender } = renderGate({ ...confirmedNewUser(), pubkey: undefined });

    expect(result.current.companionDataReady).toBe(false);

    rerender(confirmedNewUser());

    expect(result.current.companionDataReady).toBe(true);
  });

  it('does not trust the collection while it is still loading', () => {
    const { result } = renderGate({ ...confirmedNewUser(), collectionLoading: true });

    expect(result.current.companionDataReady).toBe(false);
  });

  it('does not trust the collection when the query failed', () => {
    // A relay error means "unknown", not "owns nothing".
    const { result } = renderGate({
      ...confirmedNewUser(),
      collectionError: new Error('relay unreachable'),
    });

    expect(result.current.companionDataReady).toBe(false);
  });

  it('does not trust an empty list while a fetch is still in flight', () => {
    const { result } = renderGate({ ...confirmedNewUser(), collectionFetching: true });

    expect(result.current.companionDataReady).toBe(false);
  });

  it('still trusts known companions during a background refetch', () => {
    // Once we have actually seen the user's Blobbis, a refresh must not send the
    // page back to an undecided state.
    const { result } = renderGate({
      ...confirmedNewUser(),
      companions: [makeCompanion()],
      collectionFetching: true,
    });

    expect(result.current.companionDataReady).toBe(true);
  });
});

// ─── Behaviour 4: at most one automatic start per page mount ─────────────────

describe('useAutoCeremonyGate — the automatic ceremony starts at most once per mount', () => {
  it('grants the first claim and refuses every later one', () => {
    const { result } = renderGate(confirmedNewUser());

    expect(result.current.claimAutomaticStart()).toBe(true);
    expect(result.current.claimAutomaticStart()).toBe(false);
    expect(result.current.claimAutomaticStart()).toBe(false);
  });

  it('keeps refusing across re-renders and query refreshes', () => {
    const { result, rerender } = renderGate(confirmedNewUser());

    expect(result.current.claimAutomaticStart()).toBe(true);

    // A refetch churns through fetching → settled again, re-running the effects
    // that ask to start the ceremony. None of them may start a second one.
    rerender({ ...confirmedNewUser(), collectionFetching: true });
    rerender(confirmedNewUser());
    rerender({ ...confirmedNewUser(), profileSettled: false });
    rerender(confirmedNewUser());

    expect(result.current.claimAutomaticStart()).toBe(false);
    expect(result.current.hasClaimedAutomaticStart()).toBe(true);
    // The user is still "definitely new" here — that alone must not re-open the
    // door, which is exactly the loop the latch exists to stop.
    expect(result.current.definitelyNeedsCeremony).toBe(true);
  });

  it('reports no claim before anything has started', () => {
    const { result } = renderGate(confirmedNewUser());

    expect(result.current.hasClaimedAutomaticStart()).toBe(false);
  });

  it('allows exactly one start again on a fresh page mount', () => {
    const first = renderGate(confirmedNewUser());
    expect(first.result.current.claimAutomaticStart()).toBe(true);
    first.unmount();

    // Navigating back to the page is a new mount and gets its own single start.
    const second = renderGate(confirmedNewUser());
    expect(second.result.current.claimAutomaticStart()).toBe(true);
    expect(second.result.current.claimAutomaticStart()).toBe(false);
  });
});
