import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSeoMeta } from "@unhead/react";
import { Mic } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { buildActiveThemeTags } from "@/lib/themeEvent";
import { useNostrPublish } from "@/hooks/useNostrPublish";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useAppContext } from "@/hooks/useAppContext";
import { useToast } from "@/hooks/useToast";
import { getEffectiveRelays } from "@/lib/appRelays";
import { cn } from "@/lib/utils";
import { useMoqServerList } from "@/nests/hooks/useMoqServerList";
import { buildRoomNaddr } from "@/nests/lib/room";
import { NESTS_ROOM_KIND, NestColorPalette } from "@/nests/lib/const";

export function NewNestPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const { servers } = useMoqServerList();
  const { toast } = useToast();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [color, setColor] = useState<string>(
    () => NestColorPalette[Math.floor(Math.random() * NestColorPalette.length)],
  );
  const [scheduledTime, setScheduledTime] = useState("");
  const [selectedServer, setSelectedServer] = useState(servers[0] ?? null);
  const [applyMyTheme, setApplyMyTheme] = useState(false);

  const customTheme = config.theme === "custom" ? config.customTheme : undefined;

  useSeoMeta({
    title: `Start a Nest | ${config.appName}`,
    description: "Create a new live audio room on Nostr",
  });

  const handleCreate = async () => {
    if (!user || !title.trim()) return;

    try {
      const dTag = crypto.randomUUID();
      const isScheduled = !!scheduledTime;
      const startsAt = isScheduled
        ? Math.floor(new Date(scheduledTime).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
      const server = selectedServer || servers[0];

      const relayUrls = getEffectiveRelays(
        config.relayMetadata,
        config.useAppRelays,
        config.useUserRelays,
      ).relays.filter((r) => r.write).map((r) => r.url);

      const tags: string[][] = [
        ["d", dTag],
        ["title", title.trim()],
        ["status", isScheduled ? "planned" : "live"],
        ["starts", String(startsAt)],
        ["color", color],
        ["streaming", server.relay],
        ["auth", server.auth],
        ["relays", ...relayUrls],
      ];

      if (summary.trim()) {
        tags.push(["summary", summary.trim()]);
      }

      // Theme the nest with the user's custom Ditto theme (inline c/f/bg tags)
      if (applyMyTheme && customTheme) {
        const themeTags = buildActiveThemeTags(customTheme).filter(
          ([t]) => t === "c" || t === "f" || t === "bg",
        );
        tags.push(...themeTags);
      }

      const event = await createEvent({
        kind: NESTS_ROOM_KIND,
        content: "",
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      const naddr = buildRoomNaddr(event);
      navigate(`/nests/${naddr}`, { state: { event } });
    } catch {
      toast({ title: "Failed to create nest", variant: "destructive" });
    }
  };

  return (
    <main>
      <PageHeader title="Start a Nest" icon={<Mic className="size-5" />} backTo="/nests" alwaysShowBack />

      <div className="max-w-lg mx-auto px-4 pb-8">
        <Card>
          <CardContent className="flex flex-col gap-4 md:gap-5 p-4 md:p-6">
            {!user && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-sm p-3">
                You must be logged in to start a nest.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">Nest Name *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What's the topic?"
                maxLength={100}
                className="h-11 md:h-10"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="summary">Description</Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="Tell people what this nest is about..."
                rows={3}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="schedule">Schedule (optional)</Label>
              <Input
                id="schedule"
                type="datetime-local"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="h-11 md:h-10"
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to start the nest immediately
              </p>
            </div>

            <div className="space-y-2">
              <Label>Banner Color</Label>
              <div className="flex flex-wrap gap-2">
                {NestColorPalette.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Banner color ${c}`}
                    onClick={() => setColor(c)}
                    className={cn(
                      "size-9 md:size-8 rounded-full transition-all",
                      c,
                      color === c && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                    )}
                  />
                ))}
              </div>

              {/* Preview */}
              <div className={cn("rounded-xl p-5 md:p-6 mt-3", color)}>
                <p className="text-white font-semibold text-base md:text-lg">
                  {title || "Nest Preview"}
                </p>
                {summary && (
                  <p className="text-white/70 text-sm mt-1">{summary}</p>
                )}
              </div>
            </div>

            {customTheme && (
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="apply-theme">Use my theme</Label>
                  <p className="text-xs text-muted-foreground">
                    Everyone in the nest will see your custom Ditto theme
                  </p>
                </div>
                <Switch
                  id="apply-theme"
                  checked={applyMyTheme}
                  onCheckedChange={setApplyMyTheme}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>Audio Server</Label>
              <div className="flex flex-col gap-1">
                {servers.map((server) => (
                  <button
                    key={server.relay}
                    type="button"
                    onClick={() => setSelectedServer(server)}
                    className={cn(
                      "text-left text-sm px-3 py-2.5 md:py-2 rounded-lg transition-colors",
                      (selectedServer?.relay ?? servers[0]?.relay) === server.relay
                        ? "bg-primary/20 text-primary"
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary",
                    )}
                  >
                    {server.relay}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Manage audio servers in Settings → Network
              </p>
            </div>

            <Button
              onClick={handleCreate}
              disabled={!user || !title.trim() || isPending}
              className="w-full mt-2 h-12 md:h-11 text-base md:text-sm"
              size="lg"
            >
              {isPending ? "Creating..." : scheduledTime ? "Schedule Nest" : "Start Nest"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
