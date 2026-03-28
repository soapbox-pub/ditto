/**
 * Shared notification kind utilities.
 *
 * Centralizes the mapping between notification preference keys and Nostr event
 * kinds so that `useNotifications`, `useHasUnreadNotifications`, push
 * registration, and native notification filtering all stay in sync.
 */

import type { EncryptedSettings } from '@/hooks/useEncryptedSettings';
import { LETTER_KIND } from '@/lib/letterTypes';

type NotificationPreferences = NonNullable<EncryptedSettings['notificationPreferences']>;

/** All kinds that can appear as notifications. */
export const ALL_NOTIFICATION_KINDS = [1, 6, 16, 7, 8, 9735, 1111, 1222, 1244, LETTER_KIND] as const;

/**
 * Derives the set of Nostr kinds to request based on per-type preferences.
 * Kinds default to enabled when the preference is absent.
 */
export function getEnabledNotificationKinds(
  prefs: NotificationPreferences | undefined | null,
): number[] {
  const p = prefs ?? {};
  const kinds: number[] = [];

  if (p.reactions !== false) kinds.push(7);
  if (p.reposts !== false) kinds.push(6, 16);
  if (p.zaps !== false) kinds.push(9735);
  if (p.mentions !== false) kinds.push(1);
  if (p.comments !== false) kinds.push(1111, 1222, 1244);
  if (p.badges !== false) kinds.push(8);
  if (p.letters !== false) kinds.push(LETTER_KIND);

  // Always fall back to all kinds so the query never sends an empty kinds array
  return kinds.length > 0 ? kinds : [...ALL_NOTIFICATION_KINDS];
}
