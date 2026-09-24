/**
 * Hook that provides a JSON-RPC handler for proxying NIP-07 signer calls
 * from a sandboxed nsite iframe to the parent user's signer.
 *
 * Each `nostr.*` RPC method is gated by the permission system. If no
 * stored decision exists, a prompt is shown to the user. Only one prompt is
 * shown at a time; requests that arrive while one is open are rejected.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import {
  describeNsiteRecord,
  getNsitePermission,
  setNsitePermission,
  type NsitePermissionScope,
  type NsitePermissionType,
  type NsiteRecordInfo,
} from '@/lib/nsitePermissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * How long a decision may be remembered:
 * - `always`: persisted per site
 * - `session`: until the nsite is closed
 * - `never`: asked every time
 */
export type NsiteRememberMode = 'always' | 'session' | 'never';

/** Describes a pending permission prompt waiting for the user's decision. */
export interface NsitePromptState {
  /** Unique per request, so the prompt UI resets between requests. */
  id: number;
  /** The permission type being requested. */
  type: NsitePermissionType;
  /** For signEvent: the event kind. Null otherwise. */
  kind: number | null;
  /** For signEvent: the unsigned event template. */
  event?: Record<string, unknown>;
  /**
   * The user's own record being written (kind 30078) or read (self-decrypt).
   * `unknown` means a self-decrypt whose ciphertext matched no known record.
   */
  record?: NsiteRecordInfo | 'unknown';
  /** How long the user's decision may be remembered. */
  rememberMode: NsiteRememberMode;
}

/** The user's response to a permission prompt. */
export interface NsitePromptDecision {
  /** Whether the operation is allowed. */
  allowed: boolean;
  /** Whether to remember this decision. */
  remember: boolean;
}

interface UseNsiteSignerRpcOptions {
  /** Canonical nsite subdomain identifier. */
  siteId: string;
  /** Human-readable site name for storage. */
  siteName: string;
  /** Whether the nsite is open. Session grants end when it closes. */
  active: boolean;
}

interface UseNsiteSignerRpcResult {
  /** The `onRpc` callback to pass to SandboxFrame. */
  onRpc: (
    method: string,
    params: unknown,
    post: (msg: Record<string, unknown>) => void,
  ) => Promise<unknown>;
  /** Current pending prompt, or null if no prompt is active. */
  pendingPrompt: NsitePromptState | null;
  /** Call this to resolve the current prompt. */
  resolvePrompt: (decision: NsitePromptDecision) => void;
}

type PromptRequest = Omit<NsitePromptState, 'id'>;

/**
 * Kinds whose content is commonly encrypted to the author's own key: NIP-51
 * private lists, drafts, and NIP-78 app data. Self-decrypt requests are
 * matched against the user's locally stored events of these kinds so the
 * prompt can say what is being read.
 */
const SELF_ENCRYPTED_KINDS = [10000, 10003, 30000, 30003, 30078, 31234];

/** Session key for self-decrypts that matched no known record. */
const UNKNOWN_SELF_DATA = '<unknown-self-data>';

function scopeKey(scope: NsitePermissionScope): string {
  return JSON.stringify([scope.type, scope.kind, scope.dTag]);
}

function getDTag(tags: unknown): string {
  if (!Array.isArray(tags)) return '';
  const tag = tags.find((t): t is string[] => Array.isArray(t) && t[0] === 'd');
  return typeof tag?.[1] === 'string' ? tag[1] : '';
}

/** NIP-51 list kinds, whose private items are a JSON array of tags. */
const LIST_KINDS = new Set([10000, 10003, 30000, 30003]);

/**
 * Whether decrypted content is plausibly the record it was matched to: list
 * kinds must hold a tag array, and nothing non-sensitive may hold a seed.
 */
function plaintextFitsRecord(kind: number, plaintext: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    return !LIST_KINDS.has(kind);
  }
  if (LIST_KINDS.has(kind)) {
    return Array.isArray(parsed)
      && parsed.every((t) => Array.isArray(t) && t.every((v) => typeof v === 'string'));
  }
  return !(parsed !== null && typeof parsed === 'object' && 'seed' in parsed);
}

function countDTags(tags: unknown): number {
  if (!Array.isArray(tags)) return 0;
  return tags.filter((t) => Array.isArray(t) && t[0] === 'd').length;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNsiteSignerRpc({
  siteId,
  siteName,
  active,
}: UseNsiteSignerRpcOptions): UseNsiteSignerRpcResult {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { store } = useNostrStorage();
  const [pendingPrompt, setPendingPrompt] = useState<NsitePromptState | null>(null);

  // Ref to the resolve/reject pair for the current prompt, so the prompt UI
  // can resolve it without a stale closure.
  const promptResolverRef = useRef<{
    resolve: (decision: NsitePromptDecision) => void;
    reject: (err: Error) => void;
  } | null>(null);
  const promptIdRef = useRef(0);

  // Decisions remembered only until the nsite is closed.
  const sessionDecisionsRef = useRef(new Map<string, boolean>());

  // Session decisions belong to one site and one account. Drop them, and any
  // open prompt, when the nsite is closed or either of those changes.
  const sessionOwnerRef = useRef({ siteId, pubkey: user?.pubkey });
  useEffect(() => {
    const owner = sessionOwnerRef.current;
    const switched = owner.siteId !== siteId || owner.pubkey !== user?.pubkey;
    sessionOwnerRef.current = { siteId, pubkey: user?.pubkey };
    if (active && !switched) return;
    sessionDecisionsRef.current.clear();
    // Reject a prompt left open, so it can't block the next session or be
    // answered on behalf of another account.
    promptResolverRef.current?.reject(new Error('User rejected'));
    promptResolverRef.current = null;
    setPendingPrompt(null);
  }, [active, siteId, user?.pubkey]);

  /**
   * Show a permission prompt and wait for the user's decision.
   *
   * The injected provider script serializes requests, but the site's own
   * code can post to the parent directly. A request arriving while a prompt
   * is open is rejected — replacing the prompt would let a site swap in a
   * different request just before the user clicks Allow.
   */
  const showPrompt = useCallback(
    (request: PromptRequest): Promise<NsitePromptDecision> => {
      return new Promise<NsitePromptDecision>((resolve, reject) => {
        if (promptResolverRef.current) {
          reject(new Error('Another permission request is pending'));
          return;
        }
        promptResolverRef.current = { resolve, reject };
        setPendingPrompt({ ...request, id: ++promptIdRef.current });
      });
    },
    [],
  );

  /** Resolve the current prompt with the user's decision. */
  const resolvePrompt = useCallback(
    (decision: NsitePromptDecision) => {
      if (promptResolverRef.current) {
        promptResolverRef.current.resolve(decision);
        promptResolverRef.current = null;
      }
      setPendingPrompt(null);
    },
    [],
  );

  /**
   * Check permission and optionally prompt. Returns if allowed.
   * Throws an error (with a user-facing message) if denied.
   */
  const checkPermission = useCallback(
    async (scope: NsitePermissionScope, request: PromptRequest): Promise<void> => {
      if (!user) throw new Error('Not logged in');

      const sessionKey = scopeKey(scope);
      const { rememberMode } = request;

      let stored: boolean | undefined;
      if (rememberMode === 'always') {
        const decision = getNsitePermission(siteId, user.pubkey, scope);
        if (decision !== 'ask') stored = decision === 'allow';
      } else if (rememberMode === 'session') {
        stored = sessionDecisionsRef.current.get(sessionKey);
      }

      if (stored === true) return;
      if (stored === false) throw new Error('User rejected');

      // No stored decision — ask the user.
      const decision = await showPrompt(request);

      if (decision.remember) {
        if (rememberMode === 'always') {
          setNsitePermission(siteId, user.pubkey, siteName, scope, decision.allowed);
        } else if (rememberMode === 'session') {
          sessionDecisionsRef.current.set(sessionKey, decision.allowed);
        }
      }

      if (!decision.allowed) {
        throw new Error('User rejected');
      }
    },
    [siteId, siteName, user, showPrompt],
  );

  /**
   * Find which of the user's own records a self-encrypted ciphertext is from.
   * Returns every distinct record whose content is exactly this ciphertext:
   * anyone can copy a ciphertext into a new event, so a site allowed to sign
   * one kind could republish another record's content under it.
   */
  const identifySelfCiphertext = useCallback(
    async (ciphertext: string): Promise<{ kind: number; dTag: string | null }[]> => {
      if (!user) return [];
      try {
        const events = await store.query([{ kinds: SELF_ENCRYPTED_KINDS, authors: [user.pubkey] }]);
        const matches = new Map<string, { kind: number; dTag: string | null }>();
        for (const e of events) {
          if (e.pubkey !== user.pubkey || e.content !== ciphertext) continue;
          const dTag = e.kind === 30078 ? getDTag(e.tags) : null;
          matches.set(JSON.stringify([e.kind, dTag]), { kind: e.kind, dTag });
        }
        return [...matches.values()];
      } catch {
        return [];
      }
    },
    [store, user],
  );

  /** Ask about self-encrypted data that can't be tied to one known record. */
  const checkUnknownSelfData = useCallback(
    (type: 'nip04.decrypt' | 'nip44.decrypt') => checkPermission(
      { type, kind: null, dTag: UNKNOWN_SELF_DATA },
      { type, kind: null, record: 'unknown', rememberMode: 'never' },
    ),
    [checkPermission],
  );

  /**
   * Gate a decrypt call and run it. Messages with other people share one
   * grant per operation. Data encrypted to the user's own key is gated per
   * record, since it holds private lists, settings and wallet backups.
   */
  const gatedDecrypt = useCallback(
    async (
      type: 'nip04.decrypt' | 'nip44.decrypt',
      pubkey: string,
      ciphertext: string,
      decrypt: () => Promise<string>,
    ): Promise<string> => {
      if (!user) throw new Error('Not logged in');

      if (pubkey.toLowerCase() !== user.pubkey) {
        await checkPermission(
          { type, kind: null, dTag: null },
          { type, kind: null, rememberMode: 'always' },
        );
        return decrypt();
      }

      const targets = await identifySelfCiphertext(ciphertext);

      // Unidentified data is asked about every time. It is only matched
      // against records in the local store, so a site could fetch the wallet
      // backup from relays (or alter a NIP-04 IV) to make it look unknown,
      // and a remembered grant would then cover it. The same goes for
      // ciphertext found in more than one record.
      if (targets.length !== 1) {
        await checkUnknownSelfData(type);
        return decrypt();
      }

      const [target] = targets;
      const record = describeNsiteRecord(target.kind, target.dTag, config.appId);
      await checkPermission(
        { type, kind: target.kind, dTag: target.dTag },
        { type, kind: target.kind, record, rememberMode: record.sensitive ? 'never' : 'always' },
      );
      const plaintext = await decrypt();
      if (record.sensitive) return plaintext;

      // The only copy of another record's ciphertext may be one the site
      // republished under a kind it can sign, with the real record not in the
      // local store. What it decrypts to has to fit the record it claims to
      // be, or the grant for that record doesn't cover it.
      if (!plaintextFitsRecord(target.kind, plaintext)) {
        await checkUnknownSelfData(type);
      }
      return plaintext;
    },
    [user, config.appId, checkPermission, checkUnknownSelfData, identifySelfCiphertext],
  );

  // ---------------------------------------------------------------------------
  // RPC handler
  // ---------------------------------------------------------------------------

  const onRpc = useCallback(
    async (
      method: string,
      params: unknown,
    ): Promise<unknown> => {
      if (!user) {
        throw new Error('Not logged in');
      }

      const signer = user.signer;
      const p = (params ?? {}) as Record<string, unknown>;

      switch (method) {
        // ------------------------------------------------------------------
        // getPublicKey — always allowed
        // ------------------------------------------------------------------
        case 'nostr.getPublicKey': {
          return user.pubkey;
        }

        // ------------------------------------------------------------------
        // signEvent — permission gated per kind (per d tag for kind 30078)
        // ------------------------------------------------------------------
        case 'nostr.signEvent': {
          const event = p.event as Record<string, unknown> | undefined;
          if (!event || typeof event.kind !== 'number') {
            throw new Error('Invalid event');
          }

          const kind = event.kind as number;

          if (kind === 30078) {
            // Relays match `#d` filters against every `d` tag, so a second
            // one would let a grant for one record overwrite another.
            if (countDTags(event.tags) > 1) {
              throw new Error('Events with more than one d tag are not allowed');
            }
            const dTag = getDTag(event.tags);
            const record = describeNsiteRecord(kind, dTag, config.appId);
            await checkPermission(
              { type: 'signEvent', kind, dTag },
              { type: 'signEvent', kind, event, record, rememberMode: record.sensitive ? 'never' : 'always' },
            );
          } else {
            await checkPermission(
              { type: 'signEvent', kind, dTag: null },
              { type: 'signEvent', kind, event, rememberMode: 'always' },
            );
          }

          // Build the event template the signer expects.
          const template = {
            kind: event.kind as number,
            content: (event.content as string) ?? '',
            tags: (event.tags as string[][]) ?? [],
            created_at: (event.created_at as number) ?? Math.floor(Date.now() / 1000),
          };

          const signed = await signer.signEvent(template);
          return signed;
        }

        // ------------------------------------------------------------------
        // NIP-04 encryption
        // ------------------------------------------------------------------
        case 'nostr.nip04.encrypt': {
          if (!signer.nip04) throw new Error('Signer does not support NIP-04');

          const pubkey = p.pubkey as string;
          const plaintext = p.plaintext as string;
          if (!pubkey || typeof plaintext !== 'string') {
            throw new Error('Invalid params');
          }

          await checkPermission(
            { type: 'nip04.encrypt', kind: null, dTag: null },
            { type: 'nip04.encrypt', kind: null, rememberMode: 'always' },
          );

          return await signer.nip04.encrypt(pubkey, plaintext);
        }

        case 'nostr.nip04.decrypt': {
          if (!signer.nip04) throw new Error('Signer does not support NIP-04');

          const pubkey = p.pubkey as string;
          const ciphertext = p.ciphertext as string;
          if (typeof pubkey !== 'string' || !pubkey || typeof ciphertext !== 'string') {
            throw new Error('Invalid params');
          }

          const nip04 = signer.nip04;
          return await gatedDecrypt('nip04.decrypt', pubkey, ciphertext, () => nip04.decrypt(pubkey, ciphertext));
        }

        // ------------------------------------------------------------------
        // NIP-44 encryption
        // ------------------------------------------------------------------
        case 'nostr.nip44.encrypt': {
          if (!signer.nip44) throw new Error('Signer does not support NIP-44');

          const pubkey = p.pubkey as string;
          const plaintext = p.plaintext as string;
          if (!pubkey || typeof plaintext !== 'string') {
            throw new Error('Invalid params');
          }

          await checkPermission(
            { type: 'nip44.encrypt', kind: null, dTag: null },
            { type: 'nip44.encrypt', kind: null, rememberMode: 'always' },
          );

          return await signer.nip44.encrypt(pubkey, plaintext);
        }

        case 'nostr.nip44.decrypt': {
          if (!signer.nip44) throw new Error('Signer does not support NIP-44');

          const pubkey = p.pubkey as string;
          const ciphertext = p.ciphertext as string;
          if (typeof pubkey !== 'string' || !pubkey || typeof ciphertext !== 'string') {
            throw new Error('Invalid params');
          }

          const nip44 = signer.nip44;
          return await gatedDecrypt('nip44.decrypt', pubkey, ciphertext, () => nip44.decrypt(pubkey, ciphertext));
        }

        default:
          throw new Error(`Method not found: ${method}`);
      }
    },
    [user, config.appId, checkPermission, gatedDecrypt],
  );

  return { onRpc, pendingPrompt, resolvePrompt };
}
