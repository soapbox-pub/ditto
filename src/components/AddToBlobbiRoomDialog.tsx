import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useNostr } from '@nostrify/react';
import type { NostrEvent } from '@nostrify/nostrify';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useBlobbonautProfile } from '@/hooks/useBlobbonautProfile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

import { KIND_BLOBBONAUT_PROFILE } from '@blobbi-kit/core/blobbi';
import { fetchFreshBlobbonautProfile } from '@blobbi-kit/core/fetchFreshBlobbonautProfile';
import { serializeProfileContent } from '@blobbi-kit/core/missions';

import { DEFAULT_ROOM_ORDER, ROOM_META, type BlobbiRoomId } from '@/blobbi/rooms/lib/room-config';
import { getEffectiveRoomFurniture } from '@/blobbi/rooms/lib/room-furniture-effective';
import {
  MAX_FURNITURE_PER_ROOM,
  openFloorSpot,
  parseRoomFurnitureContent,
  roomFurnitureUpdate,
  RoomFurnitureTooNewError,
} from '@/blobbi/rooms/lib/room-furniture-schema';
import { snoFurnitureId } from '@/blobbi/rooms/lib/sno-furniture';

interface AddToBlobbiRoomDialogProps {
  /** A kind 33331 Simple Nostr Object. */
  event: NostrEvent;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Place a Simple Nostr Object in one of the user's Blobbi rooms. Appends an
 * `sno:<naddr>` furniture placement to the room in their Blobbonaut profile
 * (kind 11125), read-modify-write so other rooms and settings are kept.
 */
export function AddToBlobbiRoomDialog({ event, name, open, onOpenChange }: AddToBlobbiRoomDialogProps) {
  const intl = useIntl();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { profile, isLoading, updateProfileEvent } = useBlobbonautProfile();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const [room, setRoom] = useState<BlobbiRoomId>('home');
  const [isSaving, setIsSaving] = useState(false);

  const furnitureId = snoFurnitureId(event);

  const handleAdd = async () => {
    if (!user || !furnitureId) return;
    setIsSaving(true);
    try {
      const fresh = await fetchFreshBlobbonautProfile(nostr, user.pubkey);
      if (!fresh) {
        toast({
          title: intl.formatMessage({ id: 'blobbiRoom.add.failed', defaultMessage: 'Couldn’t add the object' }),
          description: intl.formatMessage({ id: 'blobbiRoom.add.noProfile', defaultMessage: 'Couldn’t load your Blobbi profile. Try again.' }),
          variant: 'destructive',
        });
        return;
      }
      const prev = fresh.event;
      const placements = getEffectiveRoomFurniture(room, parseRoomFurnitureContent(prev.content));
      if (placements.length >= MAX_FURNITURE_PER_ROOM) {
        toast({
          title: intl.formatMessage({ id: 'blobbiRoom.add.full', defaultMessage: 'That room is full' }),
          description: intl.formatMessage(
            { id: 'blobbiRoom.add.fullDescription', defaultMessage: 'Rooms hold up to {max} items. Remove something first.' },
            { max: MAX_FURNITURE_PER_ROOM },
          ),
        });
        return;
      }
      const added = [...placements, { id: furnitureId, at: 'floor' as const, ...openFloorSpot(placements) }];
      const published = await publishEvent({
        kind: KIND_BLOBBONAUT_PROFILE,
        content: serializeProfileContent(prev.content, roomFurnitureUpdate(prev.content, room, added)),
        tags: prev.tags,
        prev,
      });
      updateProfileEvent(published);
      toast({
        title: intl.formatMessage(
          { id: 'blobbiRoom.add.done', defaultMessage: 'Added to your {room}' },
          { room: intl.formatMessage(ROOM_META[room].label) },
        ),
      });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: intl.formatMessage({ id: 'blobbiRoom.add.failed', defaultMessage: 'Couldn’t add the object' }),
        description: error instanceof RoomFurnitureTooNewError
          ? intl.formatMessage({ id: 'blobbiRoom.save.tooNew', defaultMessage: 'Your rooms were saved by a newer version of the app. Update to keep decorating.' })
          : undefined,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage id="blobbiRoom.add.title" defaultMessage="Add to your Blobbi’s room" />
          </DialogTitle>
          <DialogDescription>
            <FormattedMessage
              id="blobbiRoom.add.description"
              defaultMessage="Place “{name}” in a room. You can move it around when you decorate."
              values={{ name }}
            />
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : !profile ? (
          <div className="space-y-4 text-center py-2">
            <p className="text-sm text-muted-foreground">
              <FormattedMessage id="blobbiRoom.add.noBlobbi" defaultMessage="Adopt a Blobbi first to get a room to decorate." />
            </p>
            <Button asChild className="rounded-full">
              <Link to="/blobbi" onClick={() => onOpenChange(false)}>
                <FormattedMessage id="blobbiRoom.add.goToBlobbi" defaultMessage="Go to Blobbi" />
              </Link>
            </Button>
          </div>
        ) : (
          <>
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {DEFAULT_ROOM_ORDER.map((id) => {
                const meta = ROOM_META[id];
                const selected = room === id;
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setRoom(id)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selected ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:bg-secondary/60 text-muted-foreground',
                    )}
                  >
                    <meta.icon className="size-4 shrink-0" />
                    <span className="truncate"><FormattedMessage {...meta.label} /></span>
                    {selected && <Check className="size-4 ml-auto text-primary" />}
                  </button>
                );
              })}
            </div>
            <Button onClick={handleAdd} disabled={isSaving || !furnitureId} className="w-full rounded-full">
              {isSaving && <Loader2 className="size-4 animate-spin" />}
              <FormattedMessage id="blobbiRoom.add.confirm" defaultMessage="Place it" />
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
