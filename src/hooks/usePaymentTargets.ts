import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { rollbackQuery } from '@/lib/optimisticEvent';
import {
  PAYMENT_METHODS,
  PAYMENT_TARGETS_KIND,
  parsePaymentTargets,
  paymentTargetsToTags,
  type PaymentTarget,
  type PaymentTargetType,
} from '@/lib/paymentTargets';

/**
 * Read a pubkey's NIP-A3 payment targets (kind 10133, replaceable).
 *
 * Payment targets are public, self-authored donation endpoints — there is no
 * trust boundary to defend with an `authors` filter beyond the implicit one
 * (we query the pubkey's own kind 10133), so this mirrors the standard
 * replaceable-event read pattern.
 *
 * Returns validated, deduplicated targets (one per type) in registry order.
 */
export function usePaymentTargets(pubkey: string | undefined) {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['payment-targets', pubkey],
    queryFn: async (c) => {
      if (!pubkey) return [] as PaymentTarget[];
      const events = await nostr.query(
        [{ kinds: [PAYMENT_TARGETS_KIND], authors: [pubkey], limit: 1 }],
        { signal: c.signal },
      );
      return parsePaymentTargets(events[0]);
    },
    enabled: !!pubkey,
    staleTime: 5 * 60 * 1000,
  });

  return {
    targets: query.data ?? [],
    isLoading: query.isLoading,
  };
}

/**
 * Mutation hook for replacing the current user's payment targets (kind 10133).
 *
 * Replaceable, so this is a full overwrite — the caller supplies the complete
 * desired set and the hook serializes it to `payto` tags. We still
 * read-modify-write via {@link fetchFreshEvent} to preserve `published_at`
 * and any unrelated content the event may carry.
 */
export function useUpdatePaymentTargets() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async (targets: PaymentTarget[]) => {
      if (!user) throw new Error('You must be logged in.');

      const prev = await fetchFreshEvent(nostr, {
        kinds: [PAYMENT_TARGETS_KIND],
        authors: [user.pubkey],
      });

      const tags: string[][] = [
        ...paymentTargetsToTags(targets),
        ['alt', 'Payment targets'],
      ];

      await publishEvent({
        kind: PAYMENT_TARGETS_KIND,
        content: prev?.content ?? '',
        tags,
        prev: prev ?? undefined,
      });
    },
    // Optimistically apply the new target set so the settings UI updates
    // immediately. Snapshot for rollback on error.
    onMutate: (targets: PaymentTarget[]) => {
      const key = ['payment-targets', user?.pubkey];
      const snapshot = queryClient.getQueryData<PaymentTarget[]>(key);
      queryClient.setQueryData<PaymentTarget[]>(key, targets);
      return { snapshot, key };
    },
    onError: (_err, _targets, ctx) => {
      if (ctx) rollbackQuery(queryClient, ctx.key, ctx.snapshot);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-targets', user?.pubkey] });
    },
  });
}

/** Outcome of {@link useEnsurePaymentTarget}. */
export type EnsureTargetResult =
  /** No target of this type existed; one was published. */
  | 'added'
  /** The user already declared this type. Nothing was published. */
  | 'existing';

/**
 * Add a payment target for a type the user hasn't declared yet, leaving
 * everything else exactly as it was.
 *
 * This is the *additive* counterpart to {@link useUpdatePaymentTargets}, and
 * the difference matters. That hook takes the complete desired set and
 * re-serializes it, which means any `payto` type outside Ditto's curated
 * allowlist is dropped on write. That's acceptable in the editor, where the
 * user can see what they're saving. It is not acceptable here, because this
 * runs automatically — so instead of rebuilding the tag list, we copy the
 * previous event's tags verbatim and append one.
 *
 * The existence check reads the **raw tags** rather than the parsed targets,
 * so a `payto` entry Ditto considers malformed still counts as "already
 * declared". Anything the user put there by hand is theirs; the point of this
 * hook is to fill a gap, never to correct or replace.
 *
 * Publishing is a public act — it links a Nostr identity to a payment
 * address — so callers should surface that it happened rather than doing it
 * silently.
 */
export function useEnsurePaymentTarget() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();

  return useMutation({
    mutationFn: async ({
      type,
      authority,
    }: {
      type: PaymentTargetType;
      authority: string;
    }): Promise<EnsureTargetResult> => {
      if (!user) throw new Error('You must be logged in.');

      const value = authority.trim();
      if (!PAYMENT_METHODS[type].validate(value)) {
        throw new Error(`Invalid ${PAYMENT_METHODS[type].label} address`);
      }

      // Always read fresh: this is a replaceable event that other clients (and
      // Ditto's own profile settings) may have changed since we last looked,
      // and publishing a stale copy would drop their edits.
      const prev = await fetchFreshEvent(nostr, {
        kinds: [PAYMENT_TARGETS_KIND],
        authors: [user.pubkey],
      });

      const alreadyDeclared = (prev?.tags ?? []).some(
        (tag) => tag[0] === 'payto' && typeof tag[1] === 'string' && tag[1].trim().toLowerCase() === type,
      );
      if (alreadyDeclared) return 'existing';

      const tags = [...(prev?.tags ?? [])];
      if (!tags.some((tag) => tag[0] === 'alt')) tags.push(['alt', 'Payment targets']);
      tags.push(['payto', type, value]);

      await publishEvent({
        kind: PAYMENT_TARGETS_KIND,
        content: prev?.content ?? '',
        tags,
        prev: prev ?? undefined,
      });

      await queryClient.invalidateQueries({ queryKey: ['payment-targets', user.pubkey] });

      return 'added';
    },
  });
}
