import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { nip19 } from 'nostr-tools';
import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNestsApi } from '@/hooks/useNestsApi';
import { useAppContext } from '@/hooks/useAppContext';
import { useNostr } from '@nostrify/react';
import { cn } from '@/lib/utils';

/** Nest room kind (NIP-53 variant). */
const NEST_KIND = 30312;

/** Gradient palette for room backgrounds. */
const GRADIENT_PALETTE = [
  { id: 'gradient-1', css: 'linear-gradient(90deg, #16a085 0%, #f4d03f 100%)' },
  { id: 'gradient-2', css: 'linear-gradient(90deg, #e65c00 0%, #f9d423 100%)' },
  { id: 'gradient-3', css: 'linear-gradient(90deg, #3a1c71 0%, #d76d77 50%, #ffaf7b 100%)' },
  { id: 'gradient-4', css: 'linear-gradient(90deg, #8584b4 0%, #6969aa 50%, #62629b 100%)' },
  { id: 'gradient-5', css: 'linear-gradient(90deg, #00c6fb 0%, #005bea 100%)' },
  { id: 'gradient-6', css: 'linear-gradient(90deg, #d558c8 0%, #24d292 100%)' },
  { id: 'gradient-7', css: 'linear-gradient(90deg, #d31027 0%, #ea384d 100%)' },
  { id: 'gradient-8', css: 'linear-gradient(90deg, #ff512f 0%, #dd2476 100%)' },
  { id: 'gradient-9', css: 'linear-gradient(90deg, #6a3093 0%, #a044ff 100%)' },
  { id: 'gradient-10', css: 'linear-gradient(90deg, #00b09b 0%, #96c93d 100%)' },
  { id: 'gradient-11', css: 'linear-gradient(90deg, #f78ca0 0%, #f9748f 19%, #fd868c 60%)' },
];

interface CreateNestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateNestDialog({ open, onOpenChange }: CreateNestDialogProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const api = useNestsApi();
  const { config } = useAppContext();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [selectedGradient, setSelectedGradient] = useState('gradient-5');
  const [isCreating, setIsCreating] = useState(false);

  // Build the relay list from app config
  const relays = useMemo(() => {
    const userRelays = config.relayMetadata.relays
      .filter((r) => r.write)
      .map((r) => r.url);
    if (userRelays.length > 0) return userRelays;
    // Fallback defaults
    return [
      'wss://relay.ditto.pub',
      'wss://relay.primal.net',
      'wss://relay.damus.io',
    ];
  }, [config.relayMetadata.relays]);

  const handleCreate = async () => {
    if (!user?.signer) {
      toast({ title: 'Error', description: 'You must be logged in to create a nest.', variant: 'destructive' });
      return;
    }
    if (!name.trim()) {
      toast({ title: 'Error', description: 'Please enter a room name.', variant: 'destructive' });
      return;
    }

    setIsCreating(true);

    try {
      // 1. Create the room via the Nests API
      const room = await api.createRoom(relays);

      // 2. Build the kind 30312 event
      const isScheduled = !!scheduledTime;
      const now = Math.floor(Date.now() / 1000);

      const tags: string[][] = [
        ['d', room.roomId],
        ['title', name.trim()],
        ['status', isScheduled ? 'planned' : 'live'],
        ['starts', isScheduled ? String(Math.floor(new Date(scheduledTime).getTime() / 1000)) : String(now)],
        ['color', selectedGradient],
        ['service', config.nestsApiUrl],
        ['relays', ...relays],
      ];

      if (description.trim()) {
        tags.push(['summary', description.trim()]);
      }

      // Add streaming endpoints from the API response
      for (const endpoint of room.endpoints) {
        tags.push(['streaming', endpoint]);
      }

      // 3. Sign and broadcast
      const event = await user.signer.signEvent({
        kind: NEST_KIND,
        content: '',
        tags,
        created_at: now,
      });

      // Broadcast to all relays
      await nostr.event(event);

      // 4. Navigate to the room
      const naddr = nip19.naddrEncode({
        kind: NEST_KIND,
        pubkey: event.pubkey,
        identifier: room.roomId,
      });

      onOpenChange(false);
      resetForm();

      navigate(`/${naddr}`, {
        state: { event, token: room.token },
      });
    } catch (error) {
      console.error('Failed to create nest:', error);
      toast({
        title: 'Failed to create nest',
        description: error instanceof Error ? error.message : 'An unexpected error occurred.',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setScheduledTime('');
    setSelectedGradient('gradient-5');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create a Nest</DialogTitle>
          <DialogDescription>
            Start a live audio room. Others can join and listen.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Room name */}
          <div className="space-y-2">
            <Label htmlFor="nest-name">Room Name</Label>
            <Input
              id="nest-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What's this about?"
              maxLength={100}
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="nest-desc">Description</Label>
            <Textarea
              id="nest-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 140))}
              placeholder="Short description (optional)"
              maxLength={140}
              rows={2}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground text-right">{description.length}/140</p>
          </div>

          {/* Scheduled time */}
          <div className="space-y-2">
            <Label htmlFor="nest-time">Scheduled Time (optional)</Label>
            <Input
              id="nest-time"
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to start the room immediately.
            </p>
          </div>

          {/* Gradient picker */}
          <div className="space-y-2">
            <Label>Background Color</Label>
            <div className="grid grid-cols-6 gap-2">
              {GRADIENT_PALETTE.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={cn(
                    'h-8 rounded-lg border-2 transition-all',
                    selectedGradient === g.id
                      ? 'border-primary ring-2 ring-primary/30 scale-110'
                      : 'border-transparent hover:border-muted-foreground/30',
                  )}
                  style={{ backgroundImage: g.css }}
                  onClick={() => setSelectedGradient(g.id)}
                  aria-label={g.id}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Preview</Label>
            <div
              className="rounded-xl px-4 py-5 text-white relative overflow-hidden"
              style={{
                backgroundImage:
                  GRADIENT_PALETTE.find((g) => g.id === selectedGradient)?.css,
              }}
            >
              <div className="absolute inset-0 bg-black/20" />
              <div className="relative z-10">
                <p className="font-bold text-lg leading-snug">
                  {name || 'Untitled Nest'}
                </p>
                {description && (
                  <p className="text-sm text-white/80 mt-1 line-clamp-2">{description}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating || !name.trim()}>
            {isCreating ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Creating...
              </>
            ) : scheduledTime ? (
              'Schedule Nest'
            ) : (
              'Start Nest'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
