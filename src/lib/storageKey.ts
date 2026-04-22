/**
 * Build a namespaced localStorage key using the app's configured `appId`.
 *
 * This keeps per-fork storage isolated and prevents two forks running on the
 * same origin (e.g. during local development) from clobbering each other's
 * preferences.
 *
 * @example
 *   // In a React component / hook:
 *   const { config } = useAppContext();
 *   const key = getStorageKey(config.appId, 'showGlobalFeed');
 *   // → "ditto:showGlobalFeed" (on the default build)
 */
export function getStorageKey(appId: string, suffix: string): string {
  return `${appId}:${suffix}`;
}
