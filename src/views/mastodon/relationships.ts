import { eventsDB } from '@/db/events.ts';
import { hasTag } from '@/tags.ts';

async function renderRelationship(sourcePubkey: string, targetPubkey: string) {
  const [event3, target3, event10000, target10000] = await eventsDB.getEvents([
    { kinds: [3], authors: [sourcePubkey], limit: 1 },
    { kinds: [3], authors: [targetPubkey], limit: 1 },
    { kinds: [10000], authors: [sourcePubkey], limit: 1 },
    { kinds: [10000], authors: [targetPubkey], limit: 1 },
  ]);

  return {
    id: targetPubkey,
    following: event3 ? hasTag(event3.tags, ['p', targetPubkey]) : false,
    showing_reblogs: true,
    notifying: false,
    followed_by: target3 ? hasTag(target3?.tags, ['p', sourcePubkey]) : false,
    blocking: event10000 ? hasTag(event10000.tags, ['p', targetPubkey]) : false,
    blocked_by: target10000 ? hasTag(target10000.tags, ['p', sourcePubkey]) : false,
    muting: false,
    muting_notifications: false,
    requested: false,
    domain_blocking: false,
    endorsed: false,
  };
}

export { renderRelationship };
