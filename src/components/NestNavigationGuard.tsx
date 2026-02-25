import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
 * Global navigation guard that intercepts link clicks when a nest session
 * is active (and not already minimized). Shows a dialog with options to
 * Minimize, Leave, or Cancel.
 *
 * Works by attaching a capture-phase click listener on the document that
 * catches clicks on `<a>` elements with internal paths. This intercepts
 * React Router `<Link>` clicks without modifying any existing components.
 *
 * Render once inside the Router, above the Routes.
 */
export function NestNavigationGuard() {
  const session = useNestSession();
  const navigate = useNavigate();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  // Refs for latest session state (avoids stale closures in the listener)
  const sessionRef = useRef(session);
  sessionRef.current = session;

  // Intercept link clicks
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const s = sessionRef.current;

      // Only intercept when session is active and expanded (not minimized)
      if (!s.isActive || s.minimized) return;

      // Find the closest <a> element from the click target
      const anchor = (e.target as HTMLElement).closest('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Only intercept internal navigation (relative paths or same-origin)
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) return;

      // Don't intercept if navigating to the current nest's page
      if (s.naddr && href === `/${s.naddr}`) return;

      // Don't intercept hash-only links or empty hrefs
      if (href.startsWith('#') || href === '') return;

      // Prevent the default navigation
      e.preventDefault();
      e.stopPropagation();

      // Store the intended destination and show the dialog
      setPendingPath(href);
    };

    // Use capture phase to intercept before React Router's handler
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  const handleCancel = useCallback(() => {
    setPendingPath(null);
  }, []);

  const handleMinimize = useCallback(() => {
    const path = pendingPath;
    setPendingPath(null);
    sessionRef.current.minimize();
    if (path) navigate(path);
  }, [pendingPath, navigate]);

  const handleLeave = useCallback(() => {
    const path = pendingPath;
    setPendingPath(null);
    sessionRef.current.leaveNest();
    if (path) navigate(path);
  }, [pendingPath, navigate]);

  if (!pendingPath) return null;

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) setPendingPath(null); }}>
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
