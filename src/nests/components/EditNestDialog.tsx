import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { X, Crown, Shield, Mic } from "lucide-react";
import type { NostrEvent } from "@nostrify/nostrify";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getAvatarShape } from "@/lib/avatarShape";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuthor } from "@/hooks/useAuthor";
import { useToast } from "@/hooks/useToast";
import { getDisplayName } from "@/lib/getDisplayName";
import { cn } from "@/lib/utils";

import { useEventModifier } from "../hooks/useEventModifier";
import { useNests } from "@/contexts/nestsContextDef";
import {
  getRoomTitle,
  getRoomSummary,
  getRoomColor,
  getRoomImage,
  getRoomParticipants,
} from "../lib/room";
import { NestColorPalette } from "../lib/const";

/** Row showing a participant's avatar, name, role badge, and optional remove button. */
function ParticipantRow({
  pubkey,
  role,
  isHost,
  onRemove,
}: {
  pubkey: string;
  role: string;
  isHost?: boolean;
  onRemove?: () => void;
}) {
  const author = useAuthor(pubkey);
  const metadata = author.data?.metadata;
  const displayName = getDisplayName(metadata, pubkey);

  const roleIcon = {
    host: <Crown className="size-3.5 text-yellow-500" />,
    admin: <Shield className="size-3.5 text-blue-500" />,
    speaker: <Mic className="size-3.5 text-green-500" />,
  }[role];

  const roleLabel = {
    host: "Host",
    admin: "Admin",
    speaker: "Speaker",
  }[role] ?? role;

  return (
    <div className="flex items-center gap-3 py-2">
      <Avatar shape={getAvatarShape(metadata)} className="size-9 shrink-0">
        <AvatarImage src={metadata?.picture} alt={displayName} />
        <AvatarFallback className="text-xs bg-secondary">
          {displayName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{displayName}</p>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {roleIcon}
          <span>{roleLabel}</span>
        </div>
      </div>
      {onRemove && !isHost && (
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

interface EditNestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roomEvent: NostrEvent;
}

interface NestFormData {
  title: string;
  summary: string;
  color: string;
  image: string;
}

export function EditNestDialog({ open, onOpenChange, roomEvent }: EditNestDialogProps) {
  const navigate = useNavigate();
  const { mutateAsync: modifyEvent, isPending } = useEventModifier();
  const { session, leaveNest } = useNests();
  const { toast } = useToast();

  const { register, handleSubmit, watch, setValue } = useForm<NestFormData>({
    values: {
      title: getRoomTitle(roomEvent),
      summary: getRoomSummary(roomEvent),
      color: getRoomColor(roomEvent),
      image: getRoomImage(roomEvent) ?? "",
    },
  });

  const selectedColor = watch("color");

  const onSubmit = async (data: NestFormData) => {
    try {
      // Rebuild tags preserving existing ones, stripping editable fields
      const tags = roomEvent.tags.filter(
        ([t]) => !["title", "summary", "color", "image"].includes(t),
      );

      tags.push(["title", data.title]);
      if (data.summary) tags.push(["summary", data.summary]);
      tags.push(["color", data.color]);
      if (data.image) tags.push(["image", data.image]);

      await modifyEvent({
        kind: roomEvent.kind,
        content: roomEvent.content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
        relays: session?.relays,
      });

      toast({ title: "Nest updated" });
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to update nest", variant: "destructive" });
    }
  };

  const removeParticipant = async (pubkey: string) => {
    try {
      const tags = roomEvent.tags.filter(
        ([t, pk]) => !(t === "p" && pk === pubkey),
      );
      await modifyEvent({
        kind: roomEvent.kind,
        content: roomEvent.content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
        relays: session?.relays,
      });
      toast({ title: "Participant removed" });
    } catch {
      toast({ title: "Failed to remove participant", variant: "destructive" });
    }
  };

  const handleCloseNest = async () => {
    try {
      const tags = roomEvent.tags.map(([t, ...rest]) =>
        t === "status" ? ["status", "ended"] : [t, ...rest],
      );
      await modifyEvent({
        kind: roomEvent.kind,
        content: roomEvent.content,
        tags,
        created_at: Math.floor(Date.now() / 1000),
        relays: session?.relays,
      });
      toast({ title: "Nest closed" });
      onOpenChange(false);
      leaveNest();
      navigate("/nests");
    } catch {
      toast({ title: "Failed to close nest", variant: "destructive" });
    }
  };

  const participants = getRoomParticipants(roomEvent);
  const admins = participants.filter((p) => p.role === "admin");
  const speakers = participants.filter((p) => p.role === "speaker");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Nest</DialogTitle>
          <DialogDescription>Update nest details and permissions</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="permissions" className="flex-1">Permissions</TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="nest-title">Nest Name</Label>
                <Input id="nest-title" {...register("title", { required: true })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="nest-summary">Description</Label>
                <Textarea id="nest-summary" {...register("summary")} rows={3} />
              </div>

              <div className="space-y-2">
                <Label>Banner Color</Label>
                <div className="flex flex-wrap gap-2">
                  {NestColorPalette.map((color) => (
                    <button
                      key={color}
                      type="button"
                      aria-label={`Banner color ${color}`}
                      onClick={() => setValue("color", color)}
                      className={cn(
                        "size-8 rounded-full transition-all",
                        color,
                        selectedColor === color && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                      )}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nest-image">Banner Image URL</Label>
                <Input id="nest-image" {...register("image")} placeholder="https://..." />
              </div>

              <Button type="submit" disabled={isPending} className="w-full">
                {isPending ? "Saving..." : "Save Changes"}
              </Button>

              {/* Close Nest */}
              <div className="pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  disabled={isPending}
                  onClick={handleCloseNest}
                >
                  Close Nest
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  This will end the nest for all participants.
                </p>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="permissions">
            <div className="flex flex-col gap-4 mt-4">
              {/* Host */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Host</h4>
                <ParticipantRow pubkey={roomEvent.pubkey} role="host" isHost />
              </div>

              {/* Admins */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Admins {admins.length > 0 && `(${admins.length})`}
                </h4>
                {admins.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No admins</p>
                ) : (
                  <div className="divide-y divide-border">
                    {admins.map((a) => (
                      <ParticipantRow
                        key={a.pubkey}
                        pubkey={a.pubkey}
                        role="admin"
                        onRemove={() => removeParticipant(a.pubkey)}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Speakers */}
              <div>
                <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                  Speakers {speakers.length > 0 && `(${speakers.length})`}
                </h4>
                {speakers.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No designated speakers</p>
                ) : (
                  <div className="divide-y divide-border">
                    {speakers.map((s) => (
                      <ParticipantRow
                        key={s.pubkey}
                        pubkey={s.pubkey}
                        role="speaker"
                        onRemove={() => removeParticipant(s.pubkey)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
