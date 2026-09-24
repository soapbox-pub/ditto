import { useNostrLogin } from "@nostrify/react/login";
import { useEffect, useRef } from "react";

import { clearAllNsitePermissionsForUser } from "@/lib/nsitePermissions";
import { clearCachedBlockedRelays } from "@/lib/relayPolicy";
import { secureStorage } from "@/lib/secureStorage";

/**
 * Remove an account's wallet connections, nsite permissions and cached
 * blocked relays from this device when it logs out.
 *
 * NWC connection strings authorize payments, and on web they sit in plaintext
 * localStorage, so they shouldn't outlive the login. This watches the login
 * list rather than hooking `logout()` so every way of removing an account is
 * covered. Only removals count: logins that load late on a cold boot aren't
 * mistaken for anything.
 *
 * Renders nothing.
 */
export function LogoutCleanup() {
  const { logins } = useNostrLogin();
  const previous = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(logins.map((login) => login.pubkey));
    for (const pubkey of previous.current) {
      if (current.has(pubkey)) continue;
      void secureStorage.removeItem(`nwc-connections:${pubkey}`);
      void secureStorage.removeItem(`nwc-active-connection:${pubkey}`);
      clearAllNsitePermissionsForUser(pubkey);
      clearCachedBlockedRelays(pubkey);
    }
    previous.current = current;
  }, [logins]);

  return null;
}
