/**
 * Hook that provides a JSON-RPC handler for proxying NIP-07 signer calls
 * from a sandboxed nsite iframe to the parent user's signer.
 *
 * Each `nostr.*` RPC method is gated by the permission system. If no
 * stored decision exists, a prompt is shown to the user. Prompts are
 * serialized (one at a time) to prevent overwhelming the user.
 */
import { useCallback, useRef, useState } from 'react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  getNsitePermission,
  setNsitePermission,
  type NsitePermissionType,
} from '@/lib/nsitePermissions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Describes a pending permission prompt waiting for the user's decision. */
export interface NsitePromptState {
  /** The permission type being requested. */
  type: NsitePermissionType;
  /** For signEvent: the event kind. Null otherwise. */
  kind: number | null;
  /** For signEvent: the unsigned event template. */
  event?: Record<string, unknown>;
  /** For encrypt/decrypt: the target pubkey. */
  targetPubkey?: string;
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNsiteSignerRpc({
  siteId,
  siteName,
}: UseNsiteSignerRpcOptions): UseNsiteSignerRpcResult {
  const { user } = useCurrentUser();
  const [pendingPrompt, setPendingPrompt] = useState<NsitePromptState | null>(null);

  // Ref to the resolve/reject pair for the current prompt, so the prompt UI
  // can resolve it without a stale closure.
  const promptResolverRef = useRef<{
    resolve: (decision: NsitePromptDecision) => void;
    reject: (err: Error) => void;
  } | null>(null);

  /**
   * Show a permission prompt and wait for the user's decision.
   * Only one prompt is active at a time (enforced by the injected script's
   * serial queue — it only sends one RPC at a time).
   */
  const showPrompt = useCallback(
    (state: NsitePromptState): Promise<NsitePromptDecision> => {
      return new Promise<NsitePromptDecision>((resolve, reject) => {
        promptResolverRef.current = { resolve, reject };
        setPendingPrompt(state);
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
   * Check permission and optionally prompt. Returns true if allowed.
   * Throws an error (with a user-facing message) if denied.
   */
  const checkPermission = useCallback(
    async (
      type: NsitePermissionType,
      kind: number | null,
      promptState: NsitePromptState,
    ): Promise<void> => {
      if (!user) throw new Error('Not logged in');

      const stored = getNsitePermission(siteId, user.pubkey, type, kind);

      if (stored === 'allow') return;
      if (stored === 'deny') throw new Error('User rejected');

      // No stored decision — ask the user.
      const decision = await showPrompt(promptState);

      if (decision.remember) {
        setNsitePermission(siteId, user.pubkey, siteName, type, kind, decision.allowed);
      }

      if (!decision.allowed) {
        throw new Error('User rejected');
      }
    },
    [siteId, siteName, user, showPrompt],
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
        // signEvent — permission gated per kind
        // ------------------------------------------------------------------
        case 'nostr.signEvent': {
          const event = p.event as Record<string, unknown> | undefined;
          if (!event || typeof event.kind !== 'number') {
            throw new Error('Invalid event');
          }

          const kind = event.kind as number;

          await checkPermission('signEvent', kind, {
            type: 'signEvent',
            kind,
            event,
          });

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

          await checkPermission('nip04.encrypt', null, {
            type: 'nip04.encrypt',
            kind: null,
            targetPubkey: pubkey,
          });

          return await signer.nip04.encrypt(pubkey, plaintext);
        }

        case 'nostr.nip04.decrypt': {
          if (!signer.nip04) throw new Error('Signer does not support NIP-04');

          const pubkey = p.pubkey as string;
          const ciphertext = p.ciphertext as string;
          if (!pubkey || typeof ciphertext !== 'string') {
            throw new Error('Invalid params');
          }

          await checkPermission('nip04.decrypt', null, {
            type: 'nip04.decrypt',
            kind: null,
            targetPubkey: pubkey,
          });

          return await signer.nip04.decrypt(pubkey, ciphertext);
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

          await checkPermission('nip44.encrypt', null, {
            type: 'nip44.encrypt',
            kind: null,
            targetPubkey: pubkey,
          });

          return await signer.nip44.encrypt(pubkey, plaintext);
        }

        case 'nostr.nip44.decrypt': {
          if (!signer.nip44) throw new Error('Signer does not support NIP-44');

          const pubkey = p.pubkey as string;
          const ciphertext = p.ciphertext as string;
          if (!pubkey || typeof ciphertext !== 'string') {
            throw new Error('Invalid params');
          }

          await checkPermission('nip44.decrypt', null, {
            type: 'nip44.decrypt',
            kind: null,
            targetPubkey: pubkey,
          });

          return await signer.nip44.decrypt(pubkey, ciphertext);
        }

        default:
          throw new Error(`Method not found: ${method}`);
      }
    },
    [user, checkPermission],
  );

  return { onRpc, pendingPrompt, resolvePrompt };
}
