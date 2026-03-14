import { useNostr } from "@nostrify/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseBlossomServerList } from "@/lib/appBlossom";
import { EncryptedSettingsSchema } from "@/lib/schemas";
import { useAppContext } from "./useAppContext";
import { useCurrentUser } from "./useCurrentUser";
import type { EncryptedSettings } from "./useEncryptedSettings";
import {
  type MuteListItem,
  parseMuteTags,
  setCachedMuteItems,
} from "./useMuteList";

export type SyncPhase =
  | "idle" // No user logged in
  | "syncing" // Actively fetching settings from relays
  | "found" // Settings were found and applied, ready to proceed
  | "not-found" // No settings found, show questionnaire
  | "complete"; // Sync + setup complete, show the app

const SYNC_TIMEOUT_MS = 8000;

/**
 * Hook to manage the initial sync flow when a user logs in on a new device.
 *
 * - While logged out: phase = 'idle'
 * - On login: phase = 'syncing' (fetch relay list + encrypted settings)
 * - If settings found: decrypt, apply to config, seed query cache, then
 *   phase = 'found' -> auto-transitions to 'complete'
 * - If no settings found: phase = 'not-found' (show questionnaire)
 * - After questionnaire: markComplete() -> phase = 'complete'
 *
 * Uses a localStorage flag so the sync screen only shows once per user
 * (not on every page refresh or new session while logged in).
 */
export function isSyncDone(pubkey: string): boolean {
  try {
    return localStorage.getItem(`ditto:sync-done:${pubkey}`) === "1";
  } catch {
    return false;
  }
}

export function useInitialSync() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config, updateConfig } = useAppContext();
  const queryClient = useQueryClient();

  // Compute initial phase synchronously so we never flash sync/onboarding
  // for users who already completed it or who are logged out.
  const [phase, setPhase] = useState<SyncPhase>(() => {
    if (!user) return "idle";
    if (isSyncDone(user.pubkey)) return "complete";
    return "idle";
  });
  const syncAttempted = useRef(false);

  const markSyncComplete = useCallback(() => {
    if (!user) return;
    try {
      localStorage.setItem(`ditto:sync-done:${user.pubkey}`, "1");
    } catch {
      // localStorage may not be available
    }
  }, [user]);

  // Reset when user changes
  useEffect(() => {
    if (!user) {
      setPhase("idle");
      syncAttempted.current = false;
      return;
    }

    // Skip sync if already completed for this user
    if (isSyncDone(user.pubkey)) {
      setPhase("complete");
      return;
    }

    // Don't re-run if we already attempted for this user
    if (syncAttempted.current) return;
    syncAttempted.current = true;

    setPhase("syncing");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SYNC_TIMEOUT_MS);

    const doSync = async () => {
      let foundSettings = false;

      try {
        // Fetch relay list, Blossom server list, encrypted settings, and mute list in parallel
        const [relayEvents, blossomServerEvents, settingsEvents, muteEvents] =
          await Promise.all([
            nostr
              .query([{ kinds: [10002], authors: [user.pubkey], limit: 1 }], {
                signal: controller.signal,
              })
              .catch(() => []),
            nostr
              .query([{ kinds: [10063], authors: [user.pubkey], limit: 1 }], {
                signal: controller.signal,
              })
              .catch(() => []),
            nostr
              .query(
                [
                  {
                    kinds: [30078],
                    authors: [user.pubkey],
                    "#d": [`${config.appId}/metadata`],
                    limit: 1,
                  },
                ],
                { signal: controller.signal },
              )
              .catch(() => []),
            nostr
              .query([{ kinds: [10000], authors: [user.pubkey], limit: 1 }], {
                signal: controller.signal,
              })
              .catch(() => []),
          ]);

        // Apply relay list if found
        if (relayEvents.length > 0) {
          const event = relayEvents[0];
          // Seed into cache so NostrSync can read it without re-fetching
          queryClient.setQueryData(["relayList", user.pubkey], event);
          if (event.created_at > config.relayMetadata.updatedAt) {
            const fetchedRelays = event.tags
              .filter(([name]) => name === "r")
              .map(([, url, marker]) => ({
                url: url.replace(/\/+$/, ""),
                read: !marker || marker === "read",
                write: !marker || marker === "write",
              }));

            if (fetchedRelays.length > 0) {
              updateConfig((current) => ({
                ...current,
                relayMetadata: {
                  relays: fetchedRelays,
                  updatedAt: event.created_at,
                },
              }));
              foundSettings = true;
            }
          }
        }

        // Apply BUD-03 Blossom server list (kind 10063) if found
        if (blossomServerEvents.length > 0) {
          const event = blossomServerEvents[0];
          // Seed into cache so NostrSync can read it without re-fetching
          queryClient.setQueryData(["blossomServerList", user.pubkey], event);
          if (event.created_at > config.blossomServerMetadata.updatedAt) {
            const fetchedServers = parseBlossomServerList(event);

            if (fetchedServers.length > 0) {
              updateConfig((current) => ({
                ...current,
                blossomServerMetadata: {
                  servers: fetchedServers,
                  updatedAt: event.created_at,
                },
              }));
              foundSettings = true;
            }
          }
        }

        // Decrypt and apply encrypted settings if found
        if (
          settingsEvents.length > 0 &&
          settingsEvents[0].content &&
          user.signer.nip44
        ) {
          const settingsEvent = settingsEvents[0];

          try {
            const decrypted = await user.signer.nip44.decrypt(
              user.pubkey,
              settingsEvent.content,
            );
            const json = JSON.parse(decrypted);
            const result = EncryptedSettingsSchema.safeParse(json);
            if (!result.success) {
              console.warn(
                "Encrypted settings failed validation during initial sync:",
                result.error.issues,
              );
            }
            const parsed = (
              result.success ? result.data : {}
            ) as EncryptedSettings;

            // Apply decrypted settings to local config (same logic as NostrSync)
            updateConfig((current) => {
              const updates = { ...current };

              if (parsed.theme) {
                updates.theme = parsed.theme;
              }
              if (parsed.autoShareTheme !== undefined) {
                updates.autoShareTheme = parsed.autoShareTheme;
              }
              if (parsed.useAppRelays !== undefined) {
                updates.useAppRelays = parsed.useAppRelays;
              }
              if (parsed.feedSettings) {
                updates.feedSettings = {
                  ...current.feedSettings,
                  ...parsed.feedSettings,
                };
              }
              if (parsed.contentWarningPolicy) {
                updates.contentWarningPolicy = parsed.contentWarningPolicy;
              }
              if (parsed.sidebarOrder && parsed.sidebarOrder.length > 0) {
                updates.sidebarOrder = parsed.sidebarOrder;
              }
              if (parsed.homePage) {
                updates.homePage = parsed.homePage;
              }

              return updates;
            });

            // Seed the TanStack query cache so useEncryptedSettings doesn't
            // re-fetch the same data and NostrSync sees it immediately.
            queryClient.setQueryData(
              ["encryptedSettings", user.pubkey],
              settingsEvent,
            );
            queryClient.setQueryData(
              ["parsedSettings", settingsEvent.id],
              parsed,
            );

            foundSettings = true;
          } catch (error) {
            console.error(
              "Failed to decrypt settings during initial sync:",
              error,
            );
            // Still count the event as found — NostrSync will retry decryption later
            foundSettings = true;
          }
        }
        // Seed mute list cache if found
        if (muteEvents.length > 0) {
          const muteEvent = muteEvents[0];

          // Seed the raw event into the muteList query cache
          queryClient.setQueryData(["muteList", user.pubkey], muteEvent);

          // Parse public tags from the event
          const publicItems = parseMuteTags(muteEvent.tags);

          // Decrypt private items from the content (supports NIP-44 and NIP-04)
          let privateItems: MuteListItem[] = [];
          if (muteEvent.content) {
            try {
              const isNip04 = muteEvent.content.includes("?iv=");
              let decrypted: string | null = null;

              if (isNip04 && user.signer.nip04) {
                decrypted = await user.signer.nip04.decrypt(
                  user.pubkey,
                  muteEvent.content,
                );
              } else if (!isNip04 && user.signer.nip44) {
                decrypted = await user.signer.nip44.decrypt(
                  user.pubkey,
                  muteEvent.content,
                );
              }

              if (decrypted) {
                const tags = JSON.parse(decrypted) as string[][];
                privateItems = parseMuteTags(tags);
              }
            } catch (error) {
              console.error(
                "Failed to decrypt mute list during initial sync:",
                error,
              );
            }
          }

          // Combine and deduplicate public + private items
          const seen = new Set<string>();
          const items: MuteListItem[] = [];
          for (const item of [...publicItems, ...privateItems]) {
            const key = `${item.type}:${item.value}`;
            if (!seen.has(key)) {
              seen.add(key);
              items.push(item);
            }
          }

          queryClient.setQueryData(["muteItems", muteEvent.id], items);
          setCachedMuteItems(user.pubkey, items);

          foundSettings = true;
        }
      } catch (error) {
        // On timeout or error, treat as not found so the user can still proceed
        if (error instanceof Error && error.name === "AbortError") {
          console.warn("Initial sync timed out");
        } else {
          console.error("Initial sync failed:", error);
        }
      }

      clearTimeout(timeout);

      if (foundSettings) {
        setPhase("found");
        // Auto-complete after a brief moment so user sees the success state
        setTimeout(() => {
          markSyncComplete();
          setPhase("complete");
        }, 1200);
      } else {
        setPhase("not-found");
      }
    };

    doSync();

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [
    user,
    nostr,
    config.appId,
    config.relayMetadata.updatedAt,
    updateConfig,
    queryClient,
    markSyncComplete,
  ]);

  const markComplete = useCallback(() => {
    markSyncComplete();
    setPhase("complete");
  }, [markSyncComplete]);

  return { phase, markComplete };
}
