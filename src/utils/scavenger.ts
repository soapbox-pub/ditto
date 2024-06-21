import { NostrEvent, NSchema as n } from '@nostrify/nostrify';
import { Kysely } from 'kysely';
import { z } from 'zod';

import { DittoTables } from '@/db/DittoTables.ts';
import { getAmount } from '@/utils/bolt11.ts';

interface ScavengerEventOpts {
  savedEvent: Promise<NostrEvent | undefined>;
  kysely: Kysely<DittoTables>;
}

/** Consumes the event already stored in the database and uses it to insert into a new custom table, if eligible.
 * Scavenger is organism that eats dead or rotting biomass, such as animal flesh or plant material. */
async function scavengerEvent({ savedEvent, kysely }: ScavengerEventOpts): Promise<void> {
  const event = await savedEvent;
  if (!event) return;

  switch (event.kind) {
    case 9735:
      await handleEvent9735(kysely, event);
      break;
  }
}

async function handleEvent9735(kysely: Kysely<DittoTables>, event: NostrEvent) {
  const zapRequestString = event?.tags?.find(([name]) => name === 'description')?.[1];
  if (!zapRequestString) return;
  const zapRequest = n.json().pipe(n.event()).optional().catch(undefined).parse(zapRequestString);
  if (!zapRequest) return;

  const amountSchema = z.coerce.number().int().nonnegative().catch(0);
  const amount_millisats = amountSchema.parse(getAmount(event?.tags.find(([name]) => name === 'bolt11')?.[1]));
  if (!amount_millisats || amount_millisats < 1) return;

  const zappedEventId = zapRequest.tags.find(([name]) => name === 'e')?.[1];
  if (!zappedEventId) return;

  await kysely.insertInto('event_zaps').values({
    receipt_id: event.id,
    target_event_id: zappedEventId,
    sender_pubkey: zapRequest.pubkey,
    amount_millisats,
    comment: zapRequest.content,
  }).execute();
}

export { scavengerEvent };
