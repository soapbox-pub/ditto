import { Link, useSearchParams } from "react-router-dom";
import { Mic, Plus } from "lucide-react";
import { useSeoMeta } from "@unhead/react";
import type { NostrEvent } from "@nostrify/nostrify";

import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAppContext } from "@/hooks/useAppContext";
import { useFollowList } from "@/hooks/useFollowActions";
import { useMutedAuthorFilter } from "@/hooks/useMutedAuthorFilter";
import { NestCard } from "@/nests/components/NestCard";
import { useRoomList } from "@/nests/hooks/useRoomList";

function NestGrid({ rooms, isLoading }: { rooms: NostrEvent[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-[140px] md:h-[160px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (rooms.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 px-8 text-center">
          <div className="max-w-sm mx-auto space-y-2">
            <Mic className="size-8 text-muted-foreground/40 mx-auto" />
            <p className="text-muted-foreground">No nests found</p>
            <p className="text-sm text-muted-foreground/60">
              Check back later or start your own nest
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
      {rooms.map((event) => (
        <NestCard key={event.id} event={event} />
      ))}
    </div>
  );
}

export function NestsPage() {
  const { config } = useAppContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") ?? "browse";
  const { data, isLoading } = useRoomList();
  const { data: followList } = useFollowList();
  const { mutedPubkeys } = useMutedAuthorFilter();

  useSeoMeta({
    title: `Nests | ${config.appName}`,
    description: "Join live audio rooms on Nostr. Listen, speak, and connect with communities in real-time.",
  });

  // Filter out rooms hosted by muted users
  const liveRooms = (data?.live ?? []).filter((room) => !mutedPubkeys.has(room.pubkey));
  const plannedRooms = (data?.planned ?? []).filter((room) => !mutedPubkeys.has(room.pubkey));

  const contacts = followList?.pubkeys ?? [];
  const followingRooms = liveRooms.filter((room) =>
    contacts.includes(room.pubkey) ||
    room.tags
      .filter(([t]) => t === "p")
      .some(([, pk]) => contacts.includes(pk)),
  );

  const handleTabChange = (value: string) => {
    if (value === "browse") {
      setSearchParams({});
    } else {
      setSearchParams({ tab: value });
    }
  };

  return (
    <main>
      <PageHeader title="Nests" icon={<Mic className="size-5" />}>
        <Button asChild size="sm" className="gap-1">
          <Link to="/nests/new">
            <Plus className="size-4" />
            <span className="hidden sm:inline">Start a Nest</span>
            <span className="sm:hidden">New</span>
          </Link>
        </Button>
      </PageHeader>

      <div className="px-4 pb-8">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="mb-4">
            <TabsTrigger value="browse" className="text-xs md:text-sm">Browse</TabsTrigger>
            <TabsTrigger value="following" className="text-xs md:text-sm">Following</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="space-y-6 md:space-y-8">
            {/* Live rooms */}
            <section>
              <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
                <span className="size-2 rounded-full bg-red-500 animate-pulse" />
                Live Now
              </h2>
              <NestGrid rooms={liveRooms} isLoading={isLoading} />
            </section>

            {/* Planned rooms */}
            {plannedRooms.length > 0 && (
              <section>
                <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">Upcoming</h2>
                <NestGrid rooms={plannedRooms} isLoading={false} />
              </section>
            )}
          </TabsContent>

          <TabsContent value="following">
            <section>
              <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
                Nests from people you follow
              </h2>
              <NestGrid rooms={followingRooms} isLoading={isLoading} />
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
