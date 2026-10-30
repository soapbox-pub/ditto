/**
 * Close the service worker's notifications for events at or before the
 * notifications read cursor, so reading them in the app (on this device or,
 * once settings sync, another) clears them from the system tray too.
 *
 * Only notifications that carry the event's `createdAt` are touched; one shown
 * without the event (or by a build before this) waits to be tapped.
 */
export async function dismissReadNotifications(cursor: number): Promise<void> {
  if (cursor <= 0 || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration || typeof registration.getNotifications !== 'function') return;
    for (const notification of await registration.getNotifications()) {
      const data: unknown = notification.data;
      const createdAt = data && typeof data === 'object' && 'createdAt' in data ? data.createdAt : undefined;
      if (typeof createdAt === 'number' && createdAt <= cursor) notification.close();
    }
  } catch {
    // No notification introspection here; they stay until tapped.
  }
}
