import { useNostrLogin } from "@nostrify/react/login";
import { useEffect, useRef } from "react";

import { useAppContext } from "@/hooks/useAppContext";
import { clearCachedMuteItems } from "@/hooks/useMuteList";
import { forgetKeyLock } from "@/lib/keyLock";
import { getNip07Provider, hasDisconnect } from "@/lib/nip07";
import { clearAllNsitePermissionsForUser } from "@/lib/nsitePermissions";
import { clearCachedBlockedRelays } from "@/lib/relayPolicy";
import { secureStorage } from "@/lib/secureStorage";

/**
 * Remove an account's wallet connections, nsite permissions, cached blocked
 * relays, cached mute list and key lock (with its ncryptsec) from this device
 * when it logs out, and give an extension login's account back to the
 * extension where it can take it (`window.nostr.disconnect`, Din's and
 * Tenna's), so the site no longer holds it there either.
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
  const { config } = useAppContext();
  const previous = useRef<Set<string>>(new Set());
  const previousExtension = useRef<Set<string>>(new Set());

  useEffect(() => {
    const current = new Set(logins.map((login) => login.pubkey));
    for (const pubkey of previous.current) {
      if (current.has(pubkey)) continue;
      void secureStorage.removeItem(`nwc-connections:${pubkey}`);
      void secureStorage.removeItem(`nwc-active-connection:${pubkey}`);
      clearAllNsitePermissionsForUser(pubkey);
      clearCachedBlockedRelays(pubkey);
      clearCachedMuteItems(config.appId, pubkey);
      forgetKeyLock(pubkey);
    }
    previous.current = current;

    const extension = new Set(logins.filter((login) => login.type === "extension").map((login) => login.pubkey));
    const provider = getNip07Provider();
    for (const pubkey of previousExtension.current) {
      if (extension.has(pubkey) || !hasDisconnect(provider)) continue;
      provider.disconnect(pubkey).catch((error: unknown) => {
        console.warn("The extension didn't take the account back:", error);
      });
    }
    previousExtension.current = extension;
  }, [logins, config.appId]);

  return null;
}
