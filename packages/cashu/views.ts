import { type NostrEvent, type NostrSigner, NSchema as n } from '@nostrify/nostrify';
import type { SetRequired } from 'type-fest';
import { z } from 'zod';

type Transaction = {
  amount: number;
  created_at: number;
  direction: 'in' | 'out';
};

/** Renders one history of transaction. */
async function renderTransaction(
  event: NostrEvent,
  viewerPubkey: string,
  signer: SetRequired<NostrSigner, 'nip44'>,
): Promise<Transaction | undefined> {
  if (event.kind !== 7376) return;

  const { data: contentTags, success } = n.json().pipe(z.coerce.string().array().min(2).array()).safeParse(
    await signer.nip44.decrypt(viewerPubkey, event.content),
  );

  if (!success) {
    return;
  }

  const direction = contentTags.find(([name]) => name === 'direction')?.[1];
  if (direction !== 'out' && direction !== 'in') {
    return;
  }

  const amount = parseInt(contentTags.find(([name]) => name === 'amount')?.[1] ?? '', 10);
  if (isNaN(amount)) {
    return;
  }

  return {
    created_at: event.created_at,
    direction,
    amount,
  };
}

export { renderTransaction, type Transaction };
