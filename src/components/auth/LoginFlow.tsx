import { useEffect, useState } from 'react';
import LoginDialog from './LoginDialog';
import { QuickLoginDialog } from './QuickLoginDialog';

/** Minimal shape of the NIP-07 provider injected at `window.nostr`. */
interface Nip07Provider {
  getPublicKey(): Promise<string>;
}

function getNip07Provider(): Nip07Provider | undefined {
  if (typeof window === 'undefined' || !('nostr' in window)) return undefined;
  const provider = (window as { nostr?: unknown }).nostr;
  if (
    provider &&
    typeof (provider as Nip07Provider).getPublicKey === 'function'
  ) {
    return provider as Nip07Provider;
  }
  return undefined;
}

export interface LoginFlowProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignupClick?: () => void;
}

type View = 'probing' | 'quick' | 'full';

/**
 * Orchestrates the login flow: when opened, probes for a NIP-07 extension.
 * If one is present and exposes a pubkey, shows the one-tap QuickLoginDialog
 * ("Welcome back") first; otherwise falls through to the full LoginDialog.
 *
 * Drop-in replacement for rendering LoginDialog directly — same props.
 */
export function LoginFlow({ isOpen, onClose, onLogin, onSignupClick }: LoginFlowProps) {
  const [view, setView] = useState<View>('probing');
  const [quickLoginPubkey, setQuickLoginPubkey] = useState<string | null>(null);

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
      if (provider) {
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
