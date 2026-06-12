import { useNostr } from "@nostrify/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, useEffect } from "react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import {
  MOQ_SERVER_LIST_KIND,
  DefaultMoQServers,
  DefaultMoQAuthUrl,
  type MoQServer,
} from "../lib/const";

/**
 * Manage the user's kind:10112 MoQ audio server list.
 * Each server has a relay URL and an auth URL.
 * Tag format: ["server", "relayUrl", "authUrl"]
 */
export function useMoqServerList() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();

  const [localServers, setLocalServers] = useState<MoQServer[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  const query = useQuery({
    queryKey: ["nests", "moq-server-list", user?.pubkey ?? ""],
    queryFn: async (): Promise<MoQServer[]> => {
      if (!user) return DefaultMoQServers;

      const events = await nostr.query(
        [{ kinds: [MOQ_SERVER_LIST_KIND], authors: [user.pubkey], limit: 1 }],
        { signal: AbortSignal.timeout(3000) },
      );

      if (events.length === 0) return DefaultMoQServers;

      const servers: MoQServer[] = events[0].tags
        .filter(([t]) => t === "relay" || t === "server")
        .filter(([, url]) => !!url)
        .map(([, relay, auth]) => ({
          relay,
          auth: auth || deriveAuthUrl(relay),
        }));

      return servers.length > 0 ? servers : DefaultMoQServers;
    },
    enabled: !!user,
  });

  // Sync local state with query data
  useEffect(() => {
    if (query.data && !isDirty) {
      setLocalServers(query.data);
    }
  }, [query.data, isDirty]);

  // The effective server list — local if modified, otherwise from query/defaults
  const effectiveServers = localServers.length > 0 ? localServers : (query.data ?? DefaultMoQServers);

  const addServer = useCallback((relay: string, auth?: string) => {
    const server: MoQServer = { relay, auth: auth || deriveAuthUrl(relay) };
    setLocalServers((prev) => {
      // If local is empty, seed with current effective list first
      const base = prev.length > 0 ? prev : (query.data ?? DefaultMoQServers);
      if (base.some((s) => s.relay === relay)) return base;
      return [...base, server];
    });
    setIsDirty(true);
  }, [query.data]);

  const removeServer = useCallback((relay: string) => {
    setLocalServers((prev) => {
      const base = prev.length > 0 ? prev : (query.data ?? DefaultMoQServers);
      return base.filter((s) => s.relay !== relay);
    });
    setIsDirty(true);
  }, [query.data]);

  const save = useCallback(async () => {
    if (!user) return;

    const tags = localServers.map((s) => ["server", s.relay, s.auth]);

    await createEvent({
      kind: MOQ_SERVER_LIST_KIND,
      content: "",
      tags,
      created_at: Math.floor(Date.now() / 1000),
    });

    setIsDirty(false);
    queryClient.invalidateQueries({ queryKey: ["nests", "moq-server-list"] });
  }, [user, localServers, createEvent, queryClient]);

  return {
    servers: effectiveServers,
    isLoading: query.isLoading,
    isDirty,
    addServer,
    removeServer,
    save,
  };
}

/**
 * Derive an auth URL from a relay URL by convention.
 * https://moq.example.com:4443 -> https://moq-auth.example.com
 */
function deriveAuthUrl(relayUrl: string): string {
  try {
    const url = new URL(relayUrl);
    // Replace "moq." prefix with "moq-auth." and remove port
    const host = url.hostname.replace(/^moq\./, "moq-auth.");
    if (host === url.hostname) {
      // No "moq." prefix — just prepend "moq-auth." to the domain
      return `${url.protocol}//moq-auth.${url.hostname}`;
    }
    return `${url.protocol}//${host}`;
  } catch {
    return DefaultMoQAuthUrl;
  }
}
