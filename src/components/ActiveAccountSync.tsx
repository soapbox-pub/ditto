import { useNostrLogin } from "@nostrify/react/login";
import { useLayoutEffect } from "react";

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
 *
 * This runs in a LAYOUT effect, not a passive one, on purpose. `logins[0]`
 * flips synchronously on a switch/logout, but AppProvider's account-scoped
 * config storage only re-points once this marker updates. If that update waited
 * for the passive phase, other passive effects that write config keyed on the
 * new user — chiefly NostrSync applying the new account's settings — could run
 * first, while AppProvider's scope still points at the PREVIOUS account, and
 * write the new account's theme/relays/etc. into the old account's stored blob.
 * Updating the marker in the layout phase re-points the scope before any of
 * those writers run, so every write lands in the correct account.
 */
export function ActiveAccountSync() {
  const { logins } = useNostrLogin();
  const pubkey = logins[0]?.pubkey ?? null;

  useLayoutEffect(() => {
    setActivePubkey(pubkey);
  }, [pubkey]);

  return null;
}
