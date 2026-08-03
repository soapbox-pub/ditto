import { useNativeNotifications } from '@/hooks/useNativeNotifications';

/**
 * Side-effect component that initializes native device notifications.
 * Renders nothing. Must be mounted inside NostrProvider and NostrLoginProvider.
 *
 * The notification-permission ask and the Android battery-optimization nudge
 * are handled by the post-login setup flow (LoginSetup), which presents them as
 * full-screen wizard steps with context instead of a silent system dialog and
 * an easy-to-miss toast.
 */
export function NativeNotifications(): null {
  useNativeNotifications();
  return null;
}
