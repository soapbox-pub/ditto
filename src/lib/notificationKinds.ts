/**
 * Shared notification kind utilities.
 *
 * `NOTIFICATION_TYPES` is the one list of what Ditto notifies about: each
 * preference key and the kinds it covers. The in-app notifications query, the
 * push filters (`src/lib/push/subscriptions.ts`) and the settings toggles all
 * read it, so a kind added here reaches every transport at once. Renderers —
 * `public/sw.js` and the native pollers — still need a template for it.
 */

import type { EncryptedSettings } from '@/hooks/useEncryptedSettings';
import { LETTER_KIND } from '@/lib/letterTypes';

type NotificationPreferences = NonNullable<EncryptedSettings['notificationPreferences']>;

/** A preference key that switches one notification type on and off. */
export type NotificationTypeKey = Exclude<keyof NotificationPreferences, 'onlyFollowing'>;

export interface NotificationType {
  /** The preference that toggles this type. Absent in settings means on. */
  pref: NotificationTypeKey;
  /** Event kinds that belong to this type. */
  kinds: number[];
}

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  { pref: 'reactions', kinds: [7] },
  { pref: 'reposts', kinds: [6, 16] },
  { pref: 'zaps', kinds: [9735, 8333] },
  { pref: 'mentions', kinds: [1] },
  { pref: 'comments', kinds: [1111, 1222, 1244] },
  { pref: 'badges', kinds: [8] },
  { pref: 'letters', kinds: [LETTER_KIND] },
  { pref: 'highlights', kinds: [9802] },
  { pref: 'quizzes', kinds: [7849] },
];

/** All kinds that can appear as notifications. */
export const ALL_NOTIFICATION_KINDS: readonly number[] = NOTIFICATION_TYPES.flatMap((type) => type.kinds);

/** The notification types switched on by these preferences. */
export function getEnabledNotificationTypes(
  prefs: NotificationPreferences | undefined | null,
): NotificationType[] {
  return NOTIFICATION_TYPES.filter((type) => prefs?.[type.pref] !== false);
}

/**
 * Derives the set of Nostr kinds to request based on per-type preferences.
 * Kinds default to enabled when the preference is absent.
 */
export function getEnabledNotificationKinds(
  prefs: NotificationPreferences | undefined | null,
): number[] {
  const kinds = getEnabledNotificationTypes(prefs).flatMap((type) => type.kinds);

  // Always fall back to all kinds so the query never sends an empty kinds array
  return kinds.length > 0 ? kinds : [...ALL_NOTIFICATION_KINDS];
}
