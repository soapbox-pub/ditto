import { useContext } from 'react';

import { PushNotificationsContext, type PushNotificationsContextType } from '@/contexts/PushNotificationsContext';

/**
 * Push notifications over whichever transport this environment offers. See
 * `PushNotificationsProvider`, which owns the transport and keeps its
 * subscriptions current, and `src/lib/push/` for the transports themselves.
 */
export function usePushNotifications(): PushNotificationsContextType {
  const context = useContext(PushNotificationsContext);
  if (!context) {
    throw new Error('usePushNotifications must be used within a PushNotificationsProvider');
  }
  return context;
}
