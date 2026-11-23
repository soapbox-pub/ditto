import { useEffect, useState } from 'react';
import { useNostrLogin } from '@nostrify/react/login';

import { KeySafetyDialog } from '@/components/auth/KeySafetyDialog';
import { useOnboarding } from '@/hooks/useOnboarding';
import { clearKeyReminder, snoozeKeyReminder, useKeySafetyMarker } from '@/lib/keyBackup';
import { useLogoutRequest } from '@/lib/logoutRequest';

/**
 * Answers {@link requestLogout}. Extension and remote-signer logins go at once;
 * an nsec login gets one last chance to copy its key, and one whose key exists
 * nowhere else is warned to back it up first.
 */
export function LogoutGuard() {
  const request = useLogoutRequest();
  const { logins, removeLogin } = useNostrLogin();
  const login = request ? (request.loginId ? logins.find((l) => l.id === request.loginId) : logins[0]) : undefined;
  const nsecLogin = login?.type === 'nsec' ? login : undefined;

  useEffect(() => {
    if (!request) return;
    if (!login) request.resolve(false);
    else if (login.type !== 'nsec') {
      removeLogin(login.id);
      request.resolve(true);
    }
  }, [request, login, removeLogin]);

  if (!request || !nsecLogin) return null;

  const logOut = () => {
    // The account is going away; nothing left to remind it about.
    clearKeyReminder(nsecLogin.pubkey);
    removeLogin(nsecLogin.id);
    request.resolve(true);
  };
  const cancel = () => request.resolve(false);

  return (
    <KeySafetyDialog
      open
      onOpenChange={(open) => { if (!open) cancel(); }}
      nsec={nsecLogin.data.nsec}
      pubkey={nsecLogin.pubkey}
      onLogout={logOut}
    />
  );
}

/**
 * Asks a signup-made account to back up its key once the reminder is due (see
 * `lib/keyBackup.ts`), never over onboarding. Any dismissal snoozes it.
 */
export function KeySafetyReminder() {
  const { logins } = useNostrLogin();
  const active = logins[0]?.type === 'nsec' ? logins[0] : undefined;
  const marker = useKeySafetyMarker(active?.pubkey);
  const remindAt = marker?.remindAt ?? null;
  const backedUp = marker?.backedUp ?? false;
  const logoutRequest = useLogoutRequest();
  const { active: onboarding } = useOnboarding();
  const [due, setDue] = useState(false);
  // Latched so backing up from inside the dialog doesn't snap it shut.
  const [shown, setShown] = useState(false);
  const pending = due && remindAt !== null && !backedUp && !logoutRequest && !onboarding;

  const pubkey = active?.pubkey;
  useEffect(() => setShown(false), [pubkey]);

  useEffect(() => {
    if (pending) setShown(true);
  }, [pending]);

  // Backed up elsewhere (settings, another tab): nothing left to remind about.
  useEffect(() => {
    if (pubkey && backedUp && !shown) clearKeyReminder(pubkey);
  }, [pubkey, backedUp, shown]);

  useEffect(() => {
    setDue(false);
    if (remindAt === null) return;
    const wait = remindAt - Date.now();
    if (wait <= 0) {
      setDue(true);
      return;
    }
    // setTimeout overflows past ~24.8 days.
    const timer = setTimeout(() => setDue(true), Math.min(wait, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [remindAt]);

  if (!active) return null;

  return (
    <KeySafetyDialog
      open={shown && !logoutRequest}
      onOpenChange={(open) => {
        if (open) return;
        setShown(false);
        snoozeKeyReminder(active.pubkey);
      }}
      nsec={active.data.nsec}
      pubkey={active.pubkey}
    />
  );
}
