import { getFollows } from '@/queries.ts';
import { isFollowing } from '@/utils.ts';

async function renderRelationship(sourcePubkey: string, targetPubkey: string) {
  const [source, target] = await Promise.all([
    getFollows(sourcePubkey),
    getFollows(targetPubkey),
  ]);

  return {
    id: targetPubkey,
    following: source ? isFollowing(source, targetPubkey) : false,
    showing_reblogs: true,
    notifying: false,
    followed_by: target ? isFollowing(target, sourcePubkey) : false,
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
