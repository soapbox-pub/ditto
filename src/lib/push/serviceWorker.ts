/**
 * Register `public/sw.js`, which renders every push the napp and nostr-push
 * transports deliver. A site with no `push` listener gets nothing, on the web
 * and under Tenna alike, so this has to happen before any subscription does.
 *
 * Resolves with the registration, or null when there is no service worker
 * support or registration fails.
 */
export async function registerPushWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (err) {
    console.error('[push] SW registration failed:', err);
    return null;
  }
}
