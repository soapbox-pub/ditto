import { useNostrLogin } from "@nostrify/react/login";
import { useEffect } from "react";

import { setActivePubkey } from "@/lib/activeAccount";

/**
 * Mirror the active account's pubkey into the synchronous `activeAccount`
 * marker.
 *
 * This is the only component that can: `logins[0]` is knowable only inside
 * `NostrLoginProvider`, while the marker's reader — `AppProvider`, which has to
 * choose an account-scoped storage key on its very first render — sits above
 * it. See `lib/activeAccount.ts` for why that inversion exists.
 *
 * Renders nothing. It is a plain effect rather than part of any switch path so
 * the marker also tracks logins that appear without an explicit switch (a cold
 * boot resolving from secure storage, a fresh signup, a final logout clearing
 * the list).
 */
export function ActiveAccountSync() {
  const { logins } = useNostrLogin();
  const pubkey = logins[0]?.pubkey ?? null;

  useEffect(() => {
    setActivePubkey(pubkey);
  }, [pubkey]);

  return null;
}
