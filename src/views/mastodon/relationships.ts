import { NostrEvent } from '@nostrify/nostrify';

import { hasTag } from '@/utils/tags.ts';

interface RenderRelationshipOpts {
  sourcePubkey: string;
  targetPubkey: string;
  event3: NostrEvent | undefined;
  target3: NostrEvent | undefined;
  event10000: NostrEvent | undefined;
}

function renderRelationship({ sourcePubkey, targetPubkey, event3, target3, event10000 }: RenderRelationshipOpts) {
  return {
    id: targetPubkey,
    following: event3 ? hasTag(event3.tags, ['p', targetPubkey]) : false,
    showing_reblogs: true,
    notifying: false,
    followed_by: target3 ? hasTag(target3?.tags, ['p', sourcePubkey]) : false,
    blocking: false,
    blocked_by: false,
    muting: event10000 ? hasTag(event10000.tags, ['p', targetPubkey]) : false,
    muting_notifications: false,
    requested: false,
    domain_blocking: false,
    endorsed: false,
  };
}

export { renderRelationship };
