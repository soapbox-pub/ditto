import { useCallback, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNostr } from '@nostrify/react';
import { generateSecretKey, getPublicKey } from 'nostr-tools';

import { useAppContext } from '@/hooks/useAppContext';
import { useLoginActions } from '@/hooks/useLoginActions';
import { isNostrId } from '@/lib/nostrId';
import {
  authenticateWithGoogle,
  buildBunkerUri,
  ensureDefaultProfile,
  fetchAccount,
  getTokenEmail,
  massagePomegranateUrl,
  publishSetupAnnouncement,
  registerAccount,
  searchSetupAnnouncement,
  waitForAccount,
} from '@/lib/pomegranate';

/** Progress through the Pomegranate "Log in with Google" flow. */
export type PomegranateStatus =
  | { step: 'idle' }
  /** Google popup is open, waiting for the token postMessage. */
  | { step: 'authenticating' }
  /** Token obtained; checking central for an existing account. */
  | { step: 'checking-account' }
  /**
   * A kind 16440 announcement says this email already set up an account on a
   * *different* central server. Announcements are unauthenticated discovery
   * hints, so the flow pauses for explicit user confirmation — resume by
   * calling `start(centralUrl)` from the confirm button's click handler.
   */
  | { step: 'found-other-central'; centralUrl: string }
  /** New account: sharding the key and registering with central + operators. */
  | { step: 'creating-account'; completed: number; total: number }
  /** Account ready; creating the signing profile and doing the NIP-46 handshake. */
  | { step: 'connecting' }
  | { step: 'error'; message: string };

interface UsePomegranateLoginOptions {
  /** Called after the bunker login has been added and activated. */
  onSuccess?: () => void;
}

/**
 * State machine for logging into Ditto with Google via a Pomegranate
 * `central` server (FROST-sharded NIP-46 signing). The end result is a
 * standard `bunker://` login.
 *
 * `start()` MUST be called synchronously from a user gesture — it opens the
 * Google OAuth popup immediately, before any async work, so popup blockers
 * allow it.
 */
export function usePomegranateLogin(options: UsePomegranateLoginOptions = {}) {
  const { nostr } = useNostr();
  const { config } = useAppContext();
  const login = useLoginActions();

  const [status, setStatus] = useState<PomegranateStatus>({ step: 'idle' });

  const abortRef = useRef<AbortController | null>(null);
  const onSuccessRef = useRef(options.onSuccess);
  onSuccessRef.current = options.onSuccess;
  const loginRef = useRef(login);
  loginRef.current = login;

  /**
   * Whether Google login can be offered at all. Requires a configured
   * central server, and a real browser window — the popup + postMessage
   * handshake doesn't work inside Capacitor's native webviews.
   */
  const available = Boolean(config.pomegranateCentralUrl) && !Capacitor.isNativePlatform();

  /** Aborts any in-flight flow and returns to idle. Stable identity. */
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ step: 'idle' });
  }, []);

  const start = useCallback((overrideCentralUrl?: string) => {
    const configured = overrideCentralUrl ?? config.pomegranateCentralUrl;
    if (!configured) {
      setStatus({ step: 'error', message: 'Google login is not configured.' });
      return;
    }

    let centralUrl: string;
    try {
      centralUrl = massagePomegranateUrl(configured);
    } catch {
      setStatus({ step: 'error', message: 'Invalid Pomegranate server URL.' });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Synchronous — the popup must open within the user gesture.
    const tokenPromise = authenticateWithGoogle(centralUrl, controller.signal);
    setStatus({ step: 'authenticating' });

    const run = async (): Promise<void> => {
      const signal = controller.signal;

      const token = await tokenPromise;
      signal.throwIfAborted();
      console.info('[pomegranate] received auth token');

      const email = getTokenEmail(token);
      if (!email) throw new Error('The server returned an invalid login token.');

      setStatus({ step: 'checking-account' });
      let account = await fetchAccount(centralUrl, token, signal);
      console.info('[pomegranate] existing account?', Boolean(account));

      if (!account) {
        // No account on this central — check the public announcements in
        // case this email already set up on a different central server.
        console.info('[pomegranate] searching setup announcements (argon2id)…');
        const announcedCentral = await searchSetupAnnouncement(nostr, email, signal);
        signal.throwIfAborted();
        console.info('[pomegranate] announced central:', announcedCentral);

        if (announcedCentral && announcedCentral !== centralUrl) {
          // Pause for explicit user confirmation (see PomegranateStatus).
          setStatus({ step: 'found-other-central', centralUrl: announcedCentral });
          return;
        }

        // Fresh signup: shard a new key across the configured operators.
        const operators = (config.pomegranateOperators ?? []).map(massagePomegranateUrl);
        if (operators.length < 2) {
          throw new Error('Account creation is unavailable: no signing servers are configured.');
        }
        const threshold = config.pomegranateThreshold ??
          Math.max(2, Math.ceil(operators.length / 2));

        const total = operators.length + 1;
        setStatus({ step: 'creating-account', completed: 0, total });

        const secretKey = generateSecretKey();
        try {
          await registerAccount({
            centralUrl,
            token,
            email,
            operators,
            threshold,
            secretKey,
            signal,
            onProgress: (completed) => {
              console.info(`[pomegranate] registration progress ${completed}/${total}`);
              if (!signal.aborted) setStatus({ step: 'creating-account', completed, total });
            },
          });

          console.info('[pomegranate] waiting for account to become operational…');
          account = await waitForAccount(centralUrl, token, signal);
          console.info('[pomegranate] account operational', account.pubkey);

          // Announce the setup so other clients can find this central server.
          if (getPublicKey(secretKey) === account.pubkey) {
            await publishSetupAnnouncement(nostr, account, centralUrl, secretKey);
          }
        } finally {
          // Erase the master key — from here on, signing happens via NIP-46.
          secretKey.fill(0);
        }
      }

      setStatus({ step: 'connecting' });
      const handlerPubkey = await ensureDefaultProfile(centralUrl, token, signal);
      if (!isNostrId(handlerPubkey)) {
        throw new Error('The server returned an invalid signer pubkey.');
      }
      signal.throwIfAborted();

      const bunkerUri = buildBunkerUri(handlerPubkey, centralUrl);
      console.info('[pomegranate] connecting to bunker', { handlerPubkey, bunkerUri });
      try {
        await loginRef.current.bunker(bunkerUri);
      } catch (error) {
        console.error('[pomegranate] bunker handshake failed', error);
        throw new Error(
          'Could not reach your signer. Please try again in a moment.',
        );
      }
      console.info('[pomegranate] bunker login established');

      setStatus({ step: 'idle' });
      onSuccessRef.current?.();
    };

    run().catch((error) => {
      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        return;
      }
      console.error('Pomegranate login failed:', error);
      setStatus({
        step: 'error',
        message: error instanceof Error ? error.message : 'Login failed. Please try again.',
      });
    });
  }, [config.pomegranateCentralUrl, config.pomegranateOperators, config.pomegranateThreshold, nostr]);

  return { available, status, start, cancel };
}
