import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AudioLines, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useToast } from "@/hooks/useToast";
import { useMoqServerList } from "../hooks/useMoqServerList";
import { MOQ_SERVER_LIST_KIND, DefaultMoQServers, type MoQServer } from "../lib/const";

/**
 * Settings → Network section for managing the user's MoQ audio servers
 * (kind 10112 list). These servers carry the live audio for Nests; the
 * first entry is offered as the default when starting a new nest.
 */
export function MoqServerSettings() {
  const { user } = useCurrentUser();
  const { mutate: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const { servers } = useMoqServerList();
  const queryClient = useQueryClient();

  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [newAuthUrl, setNewAuthUrl] = useState("");

  const isDefaultList = servers.every((s) =>
    DefaultMoQServers.some((d) => d.relay === s.relay),
  ) && servers.length === DefaultMoQServers.length;

  const isValidHttpsUrl = (url: string): boolean => {
    try {
      const parsed = new URL(url.trim());
      return parsed.protocol === "https:";
    } catch {
      return false;
    }
  };

  const publishServerList = (list: MoQServer[]) => {
    publishEvent(
      {
        kind: MOQ_SERVER_LIST_KIND,
        content: "",
        tags: list.map((s) => ["server", s.relay, s.auth]),
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["nests", "moq-server-list"] });
          toast({
            title: "Audio server list published",
            description: "Your MoQ audio server list has been published to Nostr.",
          });
        },
        onError: (error) => {
          console.error("Failed to publish MoQ server list:", error);
          toast({
            title: "Failed to publish audio server list",
            variant: "destructive",
          });
        },
      },
    );
  };

  const handleAddServer = () => {
    const relay = newRelayUrl.trim();
    const auth = newAuthUrl.trim();

    if (!isValidHttpsUrl(relay)) {
      toast({
        title: "Invalid server URL",
        description: "Enter a valid HTTPS URL (e.g., https://moq.example.com:4443)",
        variant: "destructive",
      });
      return;
    }
    if (auth && !isValidHttpsUrl(auth)) {
      toast({
        title: "Invalid auth URL",
        description: "The auth service URL must be a valid HTTPS URL",
        variant: "destructive",
      });
      return;
    }

    if (servers.some((s) => s.relay === relay)) {
      toast({ title: "Server already added", variant: "destructive" });
      return;
    }

    const entry: MoQServer = { relay, auth: auth || deriveAuthUrl(relay) };
    publishServerList([...servers, entry]);
    setNewRelayUrl("");
    setNewAuthUrl("");
  };

  const handleRemoveServer = (relay: string) => {
    publishServerList(servers.filter((s) => s.relay !== relay));
  };

  const renderUrl = (url: string): string => {
    try {
      const parsed = new URL(url);
      return parsed.host + (parsed.pathname === "/" ? "" : parsed.pathname);
    } catch {
      return url;
    }
  };

  if (!user) return null;

  return (
    <div>
      <div className="pt-4 px-3 space-y-1.5">
        <p className="text-xs text-muted-foreground leading-relaxed">
          MoQ audio servers carry the live audio for Nests. The first server in
          your list is used by default when you start a new nest. Each server
          pairs a relay URL with an auth service URL; if the auth URL is left
          empty it is derived from the relay hostname.
        </p>
      </div>

      {/* Server list */}
      <div className="mt-3 space-y-1">
        {servers.map((server) => (
          <div
            key={server.relay}
            className="flex items-center gap-3 py-2.5 px-3 hover:bg-muted/20 transition-colors"
          >
            <AudioLines className="size-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs truncate" title={server.relay}>
                {renderUrl(server.relay)}
              </p>
              <p className="font-mono text-[10px] text-muted-foreground truncate" title={server.auth}>
                auth: {renderUrl(server.auth)}
              </p>
            </div>
            {isDefaultList && DefaultMoQServers.some((d) => d.relay === server.relay) ? (
              <Badge variant="outline" className="text-[10px] text-muted-foreground shrink-0">
                Default
              </Badge>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemoveServer(server.relay)}
                aria-label={`Remove ${server.relay}`}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Add server form */}
      <div className="mt-4 px-3 space-y-2">
        <Label className="text-sm font-medium">Add audio server</Label>
        <Input
          value={newRelayUrl}
          onChange={(e) => setNewRelayUrl(e.target.value)}
          placeholder="https://moq.example.com:4443"
          className="h-9 font-mono text-xs"
        />
        <Input
          value={newAuthUrl}
          onChange={(e) => setNewAuthUrl(e.target.value)}
          placeholder="https://moq-auth.example.com (optional)"
          className="h-9 font-mono text-xs"
        />
        <Button
          size="sm"
          onClick={handleAddServer}
          disabled={!newRelayUrl.trim()}
          className="gap-1"
        >
          <Plus className="size-4" />
          Add Server
        </Button>
      </div>
    </div>
  );
}

/**
 * Derive an auth URL from a relay URL by convention.
 * https://moq.example.com:4443 -> https://moq-auth.example.com
 */
function deriveAuthUrl(relayUrl: string): string {
  try {
    const url = new URL(relayUrl);
    const host = url.hostname.replace(/^moq\./, "moq-auth.");
    if (host === url.hostname) {
      return `${url.protocol}//moq-auth.${url.hostname}`;
    }
    return `${url.protocol}//${host}`;
  } catch {
    return relayUrl;
  }
}
