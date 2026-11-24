import { useEffect, useRef, useState } from 'react';
import { useLoginActions } from '@/hooks/useLoginActions';
import { getNip07Provider, hasRequestPublicKey } from '@/lib/nip07';
import LoginDialog from './LoginDialog';
import { QuickLoginDialog } from './QuickLoginDialog';

export interface LoginFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignupClick?: () => void;
}

type View = 'probing' | 'quick' | 'full';

/**
 * Orchestrates the login flow: when opened, probes for a NIP-07 extension.
 * One that can give the site an account (`requestPublicKey`) is asked for one
 * and logged in with straight away, since the extension shows the account
 * itself. Otherwise, if one exposes a pubkey, shows the one-tap
 * QuickLoginDialog ("Welcome back") first. Either way a refusal falls through
 * to the full LoginDialog.
 *
 * Drop-in replacement for rendering LoginDialog directly — same props.
 */
export function LoginFlow({ isOpen, onClose, onLogin, onSignupClick }: LoginFlowProps) {
  const [view, setView] = useState<View>('probing');
  const [quickLoginPubkey, setQuickLoginPubkey] = useState<string | null>(null);
  const login = useLoginActions();
  // Read from the effect without making each render's new object a dependency.
  const loginRef = useRef(login);
  loginRef.current = login;
  const doneRef = useRef({ onLogin, onClose });
  doneRef.current = { onLogin, onClose };
  // The account request in flight, so an effect re-run (StrictMode) waits on
  // it instead of asking the user twice.
  const requestRef = useRef<Promise<void> | null>(null);

  // Probe the NIP-07 extension each time the flow opens. While the probe is
  // pending (the extension may show its own permission popup) nothing is
  // rendered — the appropriate dialog appears once the probe resolves.
  useEffect(() => {
    if (!isOpen) {
      setView('probing');
      setQuickLoginPubkey(null);
      return;
    }

    let cancelled = false;

    const probe = async () => {
      const provider = getNip07Provider();
      if (hasRequestPublicKey(provider)) {
        requestRef.current ??= loginRef.current.extension().finally(() => {
          requestRef.current = null;
        });
        try {
          await requestRef.current;
          if (cancelled) return;
          doneRef.current.onLogin();
          doneRef.current.onClose();
          return;
        } catch {
          // Declined or errored — fall through to the full dialog.
        }
      } else if (provider) {
        try {
          const pubkey = await provider.getPublicKey();
          if (cancelled) return;
          if (pubkey) {
            setQuickLoginPubkey(pubkey);
            setView('quick');
            return;
          }
        } catch {
          // Extension declined or errored — fall through to the full dialog.
        }
      }
      if (!cancelled) setView('full');
    };

    probe();
    return () => { cancelled = true; };
  }, [isOpen]);

  return (
    <>
      {quickLoginPubkey && (
        <QuickLoginDialog
          isOpen={isOpen && view === 'quick'}
          pubkey={quickLoginPubkey}
          onClose={onClose}
          onLogin={onLogin}
          onOtherLogin={() => setView('full')}
        />
      )}

      <LoginDialog
        isOpen={isOpen && view === 'full'}
        onClose={onClose}
        onLogin={onLogin}
        onSignupClick={onSignupClick}
      />
    </>
  );
}
