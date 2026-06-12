import { useState } from "react";
import { Share2, Settings, Pencil, Volume2 } from "lucide-react";
import type { NostrEvent } from "@nostrify/nostrify";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/useToast";
import { useShareOrigin } from "@/hooks/useShareOrigin";
import { useIsAdmin } from "../hooks/useIsAdmin";
import { useNests } from "@/contexts/nestsContextDef";
import { buildRoomNaddr, getRoomTitle } from "../lib/room";
import { EditNestDialog } from "./EditNestDialog";

interface NestOptionsMenuProps {
  roomEvent: NostrEvent;
}

export function NestOptionsMenu({ roomEvent }: NestOptionsMenuProps) {
  const { isHostOrAdmin } = useIsAdmin(roomEvent);
  const { transport } = useNests();
  const { toast } = useToast();
  const shareOrigin = useShareOrigin();
  const [editOpen, setEditOpen] = useState(false);
  const [volume, setVolume] = useState(() => transport?.volume ?? 1);

  const shareNest = async () => {
    const url = `${shareOrigin}/nests/${buildRoomNaddr(roomEvent)}`;
    const title = getRoomTitle(roomEvent);
    if (navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // Fall through to clipboard (user may have dismissed the sheet)
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied to clipboard" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full size-12">
            <Settings className="size-7" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={shareNest}>
            <Share2 className="size-4 mr-2" />
            Share Nest
          </DropdownMenuItem>

          {isHostOrAdmin && (
            <DropdownMenuItem onClick={() => setEditOpen(true)}>
              <Pencil className="size-4 mr-2" />
              Edit Nest
            </DropdownMenuItem>
          )}

          {transport && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2 font-normal text-muted-foreground">
                <Volume2 className="size-4" />
                Volume
              </DropdownMenuLabel>
              <div className="px-3 pb-2" onPointerDown={(e) => e.stopPropagation()}>
                <Slider
                  value={[volume * 100]}
                  min={0}
                  max={100}
                  step={5}
                  onValueChange={([v]) => {
                    const vol = v / 100;
                    setVolume(vol);
                    transport.setVolume(vol);
                  }}
                />
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {isHostOrAdmin && (
        <EditNestDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          roomEvent={roomEvent}
        />
      )}
    </>
  );
}
