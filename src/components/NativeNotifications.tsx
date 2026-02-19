import { useNativeNotifications } from '@/hooks/useNativeNotifications';

/**
 * Side-effect component that initializes native device notifications.
 * Renders nothing. Must be mounted inside NostrProvider and NostrLoginProvider.
 */
export function NativeNotifications(): null {
  useNativeNotifications();
  return null;
}
