import type { NostrEvent } from '@nostrify/nostrify';

/**
 * Staleness threshold in seconds.
 *
 * NIP-53 suggests 1 hour, but in practice relays often serve older versions
 * of addressable events (different `created_at` depending on query filters),
 * which causes false positives at short thresholds.  24 hours is lenient
 * enough to avoid misclassifying genuinely live streams while still catching
 * streams that were abandoned without setting `status=ended`.
 */
const STALE_THRESHOLD_SECONDS = 24 * 3600; // 24 hours

/**
 * Returns the effective stream status for a kind 30311 event, applying
 * a staleness heuristic inspired by NIP-53: a `status=live` event whose
 * `created_at` is older than 24 hours is treated as `ended`.
 *
 * When no status tag is present the event is treated as `ended`.
 */
export function getEffectiveStreamStatus(event: NostrEvent): string {
  const status = event.tags.find(([n]) => n === 'status')?.[1] ?? 'ended';

  if (status === 'live') {
    const now = Math.floor(Date.now() / 1000);
    if (now - event.created_at > STALE_THRESHOLD_SECONDS) {
      return 'ended';
    }
  }

  return status;
}

/** Badge label + Tailwind classes for a live-stream status. */
export function getStreamStatusConfig(status: string | undefined): {
  label: string;
  className: string;
} {
  switch (status) {
    case 'live':
      return {
        label: 'LIVE',
        className: 'bg-red-600 hover:bg-red-600 text-white border-red-600',
      };
    case 'ended':
      return {
        label: 'ENDED',
        className: 'bg-muted text-muted-foreground border-border',
      };
    case 'planned':
      return {
        label: 'PLANNED',
        className: 'bg-blue-600/90 hover:bg-blue-600/90 text-white border-blue-600',
      };
    default:
      return {
        label: status?.toUpperCase() || 'UNKNOWN',
        className: 'bg-muted text-muted-foreground border-border',
      };
  }
}


