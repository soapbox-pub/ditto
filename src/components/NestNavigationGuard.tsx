import { useCallback, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { Mic, Minimize2, LogOut } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { useNestSession } from '@/contexts/NestSessionContext';

/**
 * Intercepts navigation away from an active nest room page
 * and shows a dialog with options to Leave, Minimize, or Cancel.
 *
 * Must be rendered inside the NestRoomPage (or any page viewing an active nest).
 */
export function NestNavigationGuard() {
  const session = useNestSession();

  // Use refs so the blocker callback always reads the latest state,
  // even before a re-render (e.g. right after handleMinimize sets minimized=true).
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Block navigation when the session is active and we're on the full room view (not minimized)
  const blocker = useBlocker(
    useCallback(() => {
      const s = sessionRef.current;
      return s.isActive && !s.minimized;
    }, []),
  );

  if (blocker.state !== 'blocked') return null;

  const handleCancel = () => {
    blocker.reset();
  };

  const handleMinimize = () => {
    session.minimize();
    blocker.proceed();
  };

  const handleLeave = () => {
    session.leaveNest();
    blocker.proceed();
  };

  return (
    <AlertDialog open>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Mic className="size-5 text-primary" />
            You're in a nest
          </AlertDialogTitle>
          <AlertDialogDescription>
            You're currently in an active audio room. What would you like to do?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleMinimize}
            className="w-full gap-2"
          >
            <Minimize2 className="size-4" />
            Minimize & Keep Listening
          </Button>
          <Button
            variant="destructive"
            onClick={handleLeave}
            className="w-full gap-2"
          >
            <LogOut className="size-4" />
            Leave Nest
          </Button>
          <Button
            variant="outline"
            onClick={handleCancel}
            className="w-full"
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
