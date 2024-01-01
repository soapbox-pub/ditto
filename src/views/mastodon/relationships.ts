import { getFollows } from '@/queries.ts';
import { hasTag } from '@/tags.ts';

async function renderRelationship(sourcePubkey: string, targetPubkey: string) {
  const [source, target] = await Promise.all([
    getFollows(sourcePubkey),
    getFollows(targetPubkey),
  ]);

  return {
    id: targetPubkey,
    following: source ? hasTag(source.tags, ['p', targetPubkey]) : false,
    showing_reblogs: true,
    notifying: false,
    followed_by: target ? hasTag(target.tags, ['p', sourcePubkey]) : false,
    blocking: false,
    blocked_by: false,
    muting: false,
    muting_notifications: false,
    requested: false,
    domain_blocking: false,
    endorsed: false,
  };
}

export { renderRelationship };
