// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, Loader2, ExternalLink, FileUp, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { QRCodeCanvas } from '@/components/ui/qrcode';
import {
  useLoginActions,
  generateNostrConnectParams,
  generateNostrConnectURI,
  type NostrConnectParams,
  type NostrConnectStatus,
} from '@/hooks/useLoginActions';
import { getNsecCredential } from '@/lib/credentialManager';
import { DialogTitle } from '@radix-ui/react-dialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useShareOrigin } from '@/hooks/useShareOrigin';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
  onSignupClick?: () => void;
}

const validateNsec = (nsec: string) => {
  return /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
};

const validateBunkerUri = (uri: string) => {
  return uri.startsWith('bunker://');
};

const connectStatusLabel = (status: NostrConnectStatus | null): string => {
  switch (status) {
    case 'awaiting-connect':
      return 'Waiting for signer connection…';
    case 'getting-public-key':
      return 'Getting public key…';
    default:
      return '';
  }
};

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin, onSignupClick }) => {
  const { config } = useAppContext();
  const shareOrigin = useShareOrigin();

  // Login state — single input accepting either an nsec or a bunker URI.
  const [loginInput, setLoginInput] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Nostrconnect (remote signer) state. On mobile the URI is launched
  // directly ("Open signer app"); on desktop a QR code is shown instead.
  const [nostrConnectParams, setNostrConnectParams] = useState<NostrConnectParams | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string>('');
  const [connectError, setConnectError] = useState<string | null>(null);
  // Progress status for the nostrconnect handshake. `null` means the
  // handshake hasn't advanced yet (or the user canceled/retried).
  const [connectStatus, setConnectStatus] = useState<NostrConnectStatus | null>(null);
  // Tracks whether the user has explicitly launched the signer app from the
  // mobile UI. The subscription starts listening as soon as params are
  // generated — without this flag we'd flip into the progress view before
  // the user has done anything. Desktop doesn't need this: it stays on the
  // QR until the handshake advances past `awaiting-connect`.
  const [hasOpenedSigner, setHasOpenedSigner] = useState(false);
  // Whether the desktop QR view is showing (chosen from the options dropdown).
  const [showQr, setShowQr] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const login = useLoginActions();

  // Keep stable refs to props/actions so the listening effect below doesn't
  // re-run on every parent render (parents typically pass inline arrow
  // functions for onLogin/onClose, and useLoginActions returns a fresh object
  // each render).
  const onLoginRef = useRef(onLogin);
  const onCloseRef = useRef(onClose);
  const loginRef = useRef(login);
  useEffect(() => { onLoginRef.current = onLogin; }, [onLogin]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => { loginRef.current = login; }, [login]);

  // Check if on mobile device
  const isMobile = useIsMobile();

  // Generate nostrconnect params (sync) and return the URI. The listening
  // effect (keyed on the params) handles the handshake once params are set.
  const generateConnectSession = useCallback((): string => {
    const relayUrls = login.getRelayUrls();
    const params = generateNostrConnectParams(relayUrls);
    const isMobileDevice = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const uri = generateNostrConnectURI(params, {
      name: config.appName,
      callback: isMobileDevice ? `${shareOrigin}/remoteloginsuccess` : undefined,
    });
    setNostrConnectParams(params);
    setNostrConnectUri(uri);
    setConnectError(null);
    return uri;
  }, [login, config.appName, shareOrigin]);

  // Start listening for connection (async) - runs once after params are set.
  //
  // Deps are intentionally limited to `nostrConnectParams` so that parent
  // re-renders (which produce fresh onLogin/onClose closures and a fresh
  // `login` object from useLoginActions) do NOT tear down an in-flight
  // subscription. Previously this effect re-ran on every render, repeatedly
  // flipping a local `cancelled` flag to true and causing a successful
  // nostrconnect response to be silently swallowed after the signer approved.
  useEffect(() => {
    if (!nostrConnectParams) return;

    const startListening = async () => {
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        await loginRef.current.nostrconnect(
          nostrConnectParams,
          controller.signal,
          (status) => {
            if (controller.signal.aborted) return;
            setConnectStatus(status);
          },
        );
        // If the dialog was explicitly closed (handled by the isOpen effect,
        // which aborts the controller), don't try to re-close it. Otherwise,
        // the user is logged in — close the dialog and notify the parent.
        if (controller.signal.aborted) return;
        onLoginRef.current();
        onCloseRef.current();
      } catch (error) {
        // AbortError means we intentionally aborted (dialog closed or retry)
        if (error instanceof Error && error.name === 'AbortError') return;
        if (controller.signal.aborted) return;
        console.error('Nostrconnect failed:', error);
        setConnectStatus(null);
        setConnectError(error instanceof Error ? error.message : String(error));
      }
    };

    startListening();

    // No cleanup here: we do NOT want a re-render-triggered effect teardown
    // to cancel the in-flight subscription. Cancellation is handled
    // explicitly by the `isOpen` effect and by handleConnectCancel().
  }, [nostrConnectParams]);

  // Clean up on close
  useEffect(() => {
    if (!isOpen) {
      setLoginInput('');
      setIsLoggingIn(false);
      setLoginError('');
      setNostrConnectParams(null);
      setNostrConnectUri('');
      setConnectError(null);
      setConnectStatus(null);
      setHasOpenedSigner(false);
      setShowQr(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen]);

  // Cancel/retry the nostrconnect handshake and return to the login form.
  const handleConnectCancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setNostrConnectParams(null);
    setNostrConnectUri('');
    setConnectError(null);
    setConnectStatus(null);
    setHasOpenedSigner(false);
    setShowQr(false);
  }, []);

  // Launch a remote signer app via nostrconnect (mobile). Generates the
  // session (if needed) and navigates to the URI; the listening effect
  // handles the handshake.
  const handleOpenSignerApp = () => {
    setLoginError('');
    // Flip into the progress view *synchronously* before navigating so that
    // when the user returns from the signer app, the dialog is already
    // showing "Waiting for signer connection…" — not the original button
    // they're worried they need to re-tap.
    setHasOpenedSigner(true);
    const uri = nostrConnectUri || generateConnectSession();
    if (uri) {
      window.location.href = uri;
    }
  };

  // Show the QR code for a remote signer to scan (desktop).
  const handleShowQr = () => {
    setLoginError('');
    if (!nostrConnectParams) {
      generateConnectSession();
    }
    setShowQr(true);
  };

  const executeLogin = (key: string) => {
    setIsLoggingIn(true);
    setLoginError('');

    // Use a timeout to allow the UI to update before the synchronous login call
    setTimeout(() => {
      try {
        login.nsec(key);
        onLogin();
        onClose();
      } catch {
        setLoginError("Failed to login with this key. Please check that it's correct.");
        setIsLoggingIn(false);
      }
    }, 50);
  };

  // Submit the entered value — either an nsec or a bunker:// URI.
  const handleLogin = () => {
    const value = loginInput.trim();
    if (!value) {
      setLoginError('Enter your secret key or bunker URI.');
      return;
    }

    if (validateBunkerUri(value)) {
      setIsLoggingIn(true);
      setLoginError('');
      login
        .bunker(value)
        .then(() => {
          onLogin();
          onClose();
        })
        .catch(() => {
          setLoginError('Failed to connect. Check the bunker URI.');
          setIsLoggingIn(false);
        });
      return;
    }

    if (!validateNsec(value)) {
      setLoginError('Enter a valid nsec1… key or bunker://… URI.');
      return;
    }

    executeLogin(value);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content && validateNsec(content.trim())) {
        setLoginInput(content.trim());
        setLoginError('');
      } else {
        setLoginError('File does not contain a valid secret key.');
      }
    };
    reader.onerror = () => setLoginError('Failed to read file.');
    reader.readAsText(file);
  };

  // Progressive enhancement: attempt to retrieve a stored credential from the
  // platform's password manager when the dialog opens.
  // On Capacitor iOS this shows the iCloud Keychain credential picker.
  // On Chromium browsers this shows the native credential chooser.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    getNsecCredential().then((cred) => {
      if (cancelled || !cred) return;
      if (validateNsec(cred.nsec)) {
        executeLogin(cred.nsec);
      }
    });

    return () => { cancelled = true; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Decide whether to render the progress view.
  // Mobile: flip in as soon as the user taps "Open signer app" (tracked by
  // `hasOpenedSigner`) so they see feedback the moment they return from the
  // signer. Desktop: keep the QR visible while waiting for the signer (it's
  // still actionable — they might scan it with a different device) and only
  // swap once the signer has acknowledged and we're fetching the pubkey.
  const showProgressView = connectStatus === 'getting-public-key' ||
    (isMobile && hasOpenedSigner);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90dvh] p-0 gap-6 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center">
            Log in
          </DialogTitle>
        </DialogHeader>

        <div className="flex size-40 text-8xl bg-primary/10 rounded-full items-center justify-center justify-self-center">
          🔑
        </div>

        <div className='px-6 pb-6 space-y-4 overflow-y-auto'>
          {onSignupClick && !connectError && !showProgressView && !showQr && (
            <p className="text-center text-sm text-muted-foreground">
              New here?{' '}
              <button
                type="button"
                onClick={() => { onClose(); onSignupClick(); }}
                className="text-primary hover:underline font-medium"
              >
                Create account
              </button>
            </p>
          )}

          {connectError ? (
            <div className='flex flex-col items-center space-y-3 py-4'>
              <p className='text-sm text-destructive text-center'>{connectError}</p>
              <Button variant='outline' onClick={handleConnectCancel} className='rounded-full'>
                Try again
              </Button>
            </div>
          ) : showProgressView ? (
            // Progress view — replaces the form/QR once the handshake is
            // under way. Gives the user live feedback through each phase so
            // a stuck signer is visibly stuck, not silently stuck.
            <div className='flex flex-col items-center space-y-4 py-6 w-full'>
              <Loader2 className='w-8 h-8 animate-spin text-primary' />
              <p className='text-sm text-muted-foreground text-center min-h-[1.25rem]'>
                {connectStatusLabel(connectStatus) || 'Waiting for your signer…'}
              </p>
              <button
                type='button'
                onClick={handleConnectCancel}
                className='text-sm text-primary hover:underline underline-offset-4 font-medium'
              >
                Cancel
              </button>
            </div>
          ) : showQr ? (
            <div className='flex flex-col items-center space-y-4'>
              {nostrConnectUri ? (
                <div className='p-4 bg-white dark:bg-white rounded-xl'>
                  <QRCodeCanvas
                    value={nostrConnectUri}
                    size={180}
                    level='M'
                  />
                </div>
              ) : (
                <div className='flex items-center justify-center h-[180px]'>
                  <Loader2 className='w-8 h-8 animate-spin text-muted-foreground' />
                </div>
              )}
              <p className='text-sm text-muted-foreground text-center'>
                Scan with a signer app to log in.
              </p>
              <button
                type='button'
                onClick={handleConnectCancel}
                className='text-sm text-muted-foreground hover:text-foreground'
              >
                Back
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
              className='space-y-3'
            >
              <div className='relative'>
                <Input
                  type='password'
                  value={loginInput}
                  onChange={(e) => {
                    setLoginInput(e.target.value);
                    if (loginError) setLoginError('');
                  }}
                  placeholder='nsec1… or bunker://…'
                  autoComplete='off'
                  className={`pr-10 ${
                    loginError ? 'border-destructive focus-visible:ring-destructive' : ''
                  }`}
                />
                <input
                  type='file'
                  accept='.txt'
                  className='hidden'
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='absolute right-0 top-0 h-full px-3 hover:bg-transparent'
                      title='More login options'
                    >
                      <Upload className='h-4 w-4 text-muted-foreground' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem
                      onSelect={() => fileInputRef.current?.click()}
                      className='flex items-center gap-2 cursor-pointer'
                    >
                      <FileUp className='h-4 w-4' />
                      Select key file
                    </DropdownMenuItem>
                    {isMobile ? (
                      <DropdownMenuItem
                        onSelect={handleOpenSignerApp}
                        className='flex items-center gap-2 cursor-pointer'
                      >
                        <ExternalLink className='h-4 w-4' />
                        Open signer app
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onSelect={handleShowQr}
                        className='flex items-center gap-2 cursor-pointer'
                      >
                        <QrCode className='h-4 w-4' />
                        Connect remote signer
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {loginError && <p className='text-sm text-destructive'>{loginError}</p>}

              <Button
                type='submit'
                disabled={isLoggingIn || !loginInput.trim()}
                className='w-full rounded-full'
              >
                {isLoggingIn ? 'Logging in…' : 'Log in'}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
