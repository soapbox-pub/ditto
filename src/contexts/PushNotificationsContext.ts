import { createContext } from 'react';

import type { PushPreferences, PushTransport } from '@/lib/push/types';

export interface PushNotificationsContextType {
  /** Current permission state, as far as the transport reports one. */
  permission: NotificationPermission;
  /** Whether push is currently active and registered. */
  enabled: boolean;
  /** Whether this environment supports push at all. */
  supported: boolean;
  /** Which transport was selected. */
  transport: PushTransport;
  /**
   * Ask for notification permission. Call from a user gesture, and only
   * proceed to enable() when this resolves 'granted'. Transports whose host
   * owns consent (napp) resolve 'granted' without prompting — their consent
   * prompt happens inside enable(), which rejects if the user declines.
   */
  requestPermission: () => Promise<NotificationPermission>;
  /**
   * Subscribe. Caller must request permission first. `prefs` overrides the
   * stored preferences, for a caller that has just changed them.
   */
  enable: (userPubkey: string, prefs?: PushPreferences) => Promise<void>;
  /** Unsubscribe and delete any service- or host-side registration. */
  disable: () => Promise<void>;
}

export const PushNotificationsContext = createContext<PushNotificationsContextType | undefined>(undefined);
