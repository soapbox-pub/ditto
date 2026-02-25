import { useNavigate } from 'react-router-dom';
import { Mic, MicOff, Maximize2, X } from 'lucide-react';
import { useLocalParticipant, RoomContext } from '@livekit/components-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useNestSession } from '@/contexts/NestSessionContext';
import { cn } from '@/lib/utils';

/** Gradient CSS values for the accent strip. */
const NEST_GRADIENTS: Record<string, string> = {
  'gradient-1': 'linear-gradient(90deg, #16a085 0%, #f4d03f 100%)',
  'gradient-2': 'linear-gradient(90deg, #e65c00 0%, #f9d423 100%)',
  'gradient-3': 'linear-gradient(90deg, #3a1c71 0%, #d76d77 50%, #ffaf7b 100%)',
  'gradient-4': 'linear-gradient(90deg, #8584b4 0%, #6969aa 50%, #62629b 100%)',
  'gradient-5': 'linear-gradient(90deg, #00c6fb 0%, #005bea 100%)',
  'gradient-6': 'linear-gradient(90deg, #d558c8 0%, #24d292 100%)',
  'gradient-7': 'linear-gradient(90deg, #d31027 0%, #ea384d 100%)',
  'gradient-8': 'linear-gradient(90deg, #ff512f 0%, #dd2476 100%)',
  'gradient-9': 'linear-gradient(90deg, #6a3093 0%, #a044ff 100%)',
  'gradient-10': 'linear-gradient(90deg, #00b09b 0%, #96c93d 100%)',
  'gradient-11': 'linear-gradient(90deg, #f78ca0 0%, #f9748f 19%, #fd868c 60%)',
};

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/**
 * Persistent mini-bar shown at the bottom of the screen when a nest is minimized.
 * Provides mic toggle, expand, and leave controls.
 * Must be rendered inside the NestSessionProvider.
 */
export function MinimizedNestBar() {
  const session = useNestSession();
  const navigate = useNavigate();

  if (!session.isActive || !session.minimized || !session.event) return null;

  const title = getTag(session.event.tags, 'title') || 'Nest';
  const color = getTag(session.event.tags, 'color');
  const gradient = (color && NEST_GRADIENTS[color]) || NEST_GRADIENTS['gradient-5'];

  const handleExpand = () => {
    session.expand();
    navigate(`/${session.naddr}`);
  };

  const handleLeave = () => {
    session.leaveNest();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-30 sidebar:bottom-0 max-sidebar:bottom-[calc(3.5rem+env(safe-area-inset-bottom))]">
      {/* Gradient accent strip */}
      <div className="h-0.5" style={{ backgroundImage: gradient }} />

      <div className="flex items-center gap-2 px-3 py-2 bg-background/95 backdrop-blur-md border-t border-border">
        {/* Color dot + title */}
        <button
          type="button"
          className="flex items-center gap-2.5 min-w-0 flex-1"
          onClick={handleExpand}
        >
          <div
            className="size-8 rounded-lg shrink-0"
            style={{ backgroundImage: gradient }}
          />
          <div className="min-w-0 text-left">
            <p className="text-sm font-semibold truncate leading-tight">{title}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">
              Nest - Tap to expand
            </p>
          </div>
        </button>

        {/* Controls — needs LiveKit context for mic state */}
        {session.room && (
          <RoomContext.Provider value={session.room}>
            <MiniBarMicButton />
          </RoomContext.Provider>
        )}

        {/* Expand */}
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={handleExpand}
        >
          <Maximize2 className="size-4" />
        </Button>

        {/* Leave — with confirmation */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-destructive hover:text-destructive"
            >
              <X className="size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave this nest?</AlertDialogTitle>
              <AlertDialogDescription>
                You will be disconnected from the audio room.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleLeave}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Leave
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

/** Mic toggle button that reads LiveKit local participant state. */
function MiniBarMicButton() {
  const { localParticipant, isMicrophoneEnabled } = useLocalParticipant();
  const isOnStage = localParticipant?.permissions?.canPublish ?? false;

  if (!isOnStage) return null;

  const handleToggle = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch {
      // ignore
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        'size-8 shrink-0 rounded-full',
        isMicrophoneEnabled
          ? 'text-primary'
          : 'text-destructive',
      )}
      onClick={handleToggle}
    >
      {isMicrophoneEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
    </Button>
  );
}
