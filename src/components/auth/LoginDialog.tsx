// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ChevronDown, Loader2, ExternalLink, FileUp, QrCode } from 'lucide-react';
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
      <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90dvh] p-0 gap-3 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center">
            Log in
          </DialogTitle>
        </DialogHeader>

        <LoginHero />

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
                  className={`pr-12 ${
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
                      className='absolute right-0 top-0 h-full w-10 rounded-l-none border-l border-input bg-muted/40 hover:bg-muted'
                      title='More login options'
                      aria-label='More login options'
                    >
                      <ChevronDown className='h-4 w-4 text-muted-foreground' />
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

/**
 * The orbital-ring path (`path5`) from `public/logo.svg`, inlined so the
 * unlock moment can light the ring itself up white. Logo
 * coordinates (viewBox -5 -10 100 100); mapped into the 176px overlay
 * via `scale(1.76) translate(5 10)`.
 */
const RING_PATH = 'm 90.441615,21.60007 c -2.1797,-5.3398 -9.4102,-7.3984 -21,-6.0391 1.8906,1.8906 3.5391,3.9688 4.9297,6.2109 0.28906,0.46094 0.55859,0.92187 0.80859,1.3789 5.5391,-0.12109 7.6094,1.0391 7.8398,1.4492 0.12891,0.46875 -0.55078,2.7305 -4.5898,6.4805 -0.01953,0.01953 -0.03125,0.03125 -0.03906,0.03906 -0.26172,0.23828 -0.51953,0.48047 -0.80078,0.71875 -0.19922,0.17969 -0.41016,0.35938 -0.62891,0.53906 -0.10938,0.10156 -0.21875,0.19141 -0.33984,0.28906 -0.23828,0.19922 -0.5,0.41016 -0.76172,0.62109 -0.12891,0.10156 -0.26172,0.21094 -0.39844,0.32031 -0.42969,0.33984 -0.89063,0.69141 -1.3711,1.0508 -0.26953,0.21094 -0.53906,0.41016 -0.82812,0.60938 -0.32031,0.23047 -0.64062,0.46875 -0.98047,0.69922 0,0.01172 -0.01172,0.01172 -0.01172,0.01172 -0.26953,0.19141 -0.55078,0.37891 -0.82812,0.57031 -0.28125,0.19141 -0.55859,0.37109 -0.85156,0.55859 -0.25,0.16016 -0.5,0.32812 -0.76172,0.48828 -6,3.8984 -13.48,7.7188 -21.379,10.922 -8.0117,3.2383 -15.871,5.6602 -22.93,7.0391 -0.30078,0.05859 -0.60156,0.12109 -0.89062,0.17188 -0.60938,0.12109 -1.2188,0.21875 -1.8203,0.32031 -0.07031,0.01172 -0.12891,0.01953 -0.19922,0.03125 h -0.01953 c -0.28906,0.05078 -0.57031,0.08984 -0.83984,0.12891 -0.30859,0.05078 -0.60938,0.08984 -0.91016,0.12891 -0.57031,0.07813 -1.1094,0.14844 -1.6406,0.21094 -0.35156,0.03906 -0.69141,0.07031 -1.0195,0.10156 -0.30078,0.03125 -0.58984,0.05078 -0.87891,0.07813 -0.48047,0.03125 -0.92969,0.05859 -1.3711,0.07813 -0.39844,0.01953 -0.78125,0.03125 -1.1484,0.03906 -5.5116996,0.10938 -7.5702996,-1.0391 -7.8007996,-1.4492 -0.12891,-0.48047 0.55078,-2.7383 4.6093996,-6.5 -0.12891,-0.48828 -0.26172,-1 -0.37891,-1.5391 -0.51953,-2.4219 -0.78906,-4.8906 -0.78906,-7.3594 0,-0.17969 0,-0.37109 0.01172,-0.55078 -9.2733996,7.082 -13.0229996,13.59 -10.8749996,18.949 1.7383,4.2695 6.7188,6.4492 14.5899996,6.4492 2.8594,0 6.1016,-0.28906 9.7109,-0.87109 0.17188,-0.03125 0.33984,-0.05859 0.51953,-0.08984 0.17188,-0.03125 0.35156,-0.05859 0.51953,-0.08984 l 1.2188,-0.21875 c 0.57031,-0.10156 1.1484,-0.21875 1.7305,-0.33984 0.53125,-0.10938 1.0508,-0.21094 1.5781,-0.32812 0.01172,0 0.03125,-0.01172 0.03906,-0.01172 0.05078,-0.01172 0.08984,-0.01953 0.14062,-0.03125 0.07031,-0.01172 0.12891,-0.03125 0.19922,-0.05078 0.57812,-0.12891 1.1602,-0.26172 1.7383,-0.39844 0.05078,-0.01172 0.10156,-0.03125 0.14844,-0.03906 0.21094,-0.05078 0.42188,-0.10156 0.64062,-0.14844 h 0.01172 c 6.0898,-1.5117 12.559,-3.6406 19.102,-6.2891 6.5508,-2.6602 12.68,-5.6289 18.109,-8.7812 0.21875,-0.12891 0.44141,-0.26172 0.66016,-0.39062 0.58984,-0.33984 1.1797,-0.69141 1.7617,-1.0508 1.5703,-0.96094 3.0586,-1.9297 4.4805,-2.9102 0.12891,-0.08984 0.26172,-0.17969 0.39062,-0.26953 11.242,-7.8477 15.941,-15.09 13.594,-20.938 z';

/**
 * The planet arcs (`path1` + `path4`) from `public/logo.svg` — without
 * `path2`/`path3`, the little highlight ("shine") arcs — so the hero
 * renders a clean planet. Same coordinate mapping as RING_PATH.
 */
const PLANET_PATHS = [
  'm 71.719615,49.36907 -0.62891,0.37109 c -0.12891,0.07031 -0.26172,0.14844 -0.39062,0.21875 -3.9883,10.309 -14.008,17.617 -25.699,17.617 -4.1211,0 -8.0312,-0.89844 -11.539,-2.5391 -0.12891,0.03906 -0.26172,0.07031 -0.39063,0.10156 l -0.35156,0.08984 h -0.02734 l -0.25,0.05859 -0.07813,0.01953 -0.10938,0.03125 c -0.55859,0.12891 -1.1289,0.26172 -1.6992,0.39062 -0.10156,0.03125 -0.19922,0.05078 -0.30078,0.07031 l -0.30078,0.10156 -0.18359,0.0078 c -0.26953,0.05859 -1.3086,0.26953 -1.3086,0.26953 -0.28906,0.05859 -0.55859,0.10937 -0.82813,0.17187 4.9805,3.3086 10.961,5.2305 17.371,5.2305 15.059,0 27.699,-10.602 30.828,-24.738 -0.75,0.48828 -1.5195,0.96875 -2.2891,1.4414 -0.59375,0.36328 -1.2031,0.72656 -1.8242,1.0859 z',
  'm 14.691615,48.83807 c 0.10156,0.33984 0.19922,0.67969 0.32812,1.0195 0.42969,1.3516 0.94922,2.6484 1.5781,3.9102 0.10156,-0.01172 0.21094,-0.01172 0.32031,-0.01953 l 0.16016,-0.01172 0.80078,-0.07031 c 0.37109,-0.03906 0.67188,-0.07031 0.98047,-0.10156 0.51172,-0.05859 1.0195,-0.12109 1.5586,-0.19922 l 0.21875,-0.03125 c 0.07031,-0.01172 0.14062,-0.01953 0.21094,-0.03125 -1.2188,-2.2109 -2.1484,-4.6016 -2.7305,-7.1211 -0.16016,-0.71094 -0.30078,-1.4297 -0.39844,-2.1602 -0.19922,-1.3086 -0.30078,-2.6602 -0.30078,-4.0312 0,-0.89844 0.03906,-1.7812 0.12891,-2.6484 0.07031,-0.71094 0.16016,-1.4102 0.28906,-2.1016 2.25,-12.949 13.57,-22.828 27.16,-22.828 6.0508,0 11.648,1.9609 16.211,5.3008 0.57031,0.41016 1.1289,0.85938 1.6719,1.3203 1.6914,1.4219 3.2109,3.0703 4.5,4.8789 0.42969,0.60156 0.83984,1.2109 1.2188,1.8398 1.3203,2.1602 2.3398,4.5117 3.0195,7 0.23828,-0.17188 0.42969,-0.30859 0.62891,-0.46875 0.64844,-0.48047 1.2109,-0.92188 1.7383,-1.3398 0.28125,-0.23047 0.5,-0.41016 0.71094,-0.57812 0.10156,-0.07813 0.19141,-0.16016 0.28125,-0.23828 -0.42969,-1.3516 -0.96094,-2.6484 -1.5898,-3.8984 -0.14062,-0.32812 -0.30859,-0.64844 -0.48047,-0.96875 -0.32812,-0.64844 -0.69922,-1.2891 -1.0898,-1.9102 -1.6797,-2.7109 -3.7695,-5.1406 -6.1719,-7.2188 -0.57031,-0.48828 -1.1484,-0.96875 -1.7617,-1.4102 -0.55859,-0.42188 -1.1406,-0.82812 -1.7305,-1.2109 -4.9414,-3.2188 -10.852,-5.0898 -17.16,-5.0898 -14.961,0 -27.531,10.469 -30.75,24.469 -0.17188,0.67969 -0.30859,1.3711 -0.42188,2.0703 -0.12891,0.73828 -0.21875,1.5 -0.28906,2.2617 -0.07813,0.91016 -0.12109,1.8398 -0.12109,2.7812 0,2.3008 0.25,4.5508 0.71875,6.7109 0.17188,0.71484 0.35156,1.4258 0.5625,2.125 z',
];

/**
 * The animated login hero: the real app logo with a keyhole at the planet's
 * center, and a little line-art key that appears, slides into the keyhole,
 * turns, and fades out — a looping "this is how you log in" vignette.
 * Honors `prefers-reduced-motion` (static logo + keyhole, no key).
 */
function LoginHero() {
  return (
    <div className="relative size-52 justify-self-center">
      <LoginHeroKeyframes />

      {/* Behind layer: the keyhole and the unlock ripples sit underneath the
          logo, so the orbital ring sweeps in front of them. */}
      <svg
        viewBox="0 0 176 176"
        width={208}
        height={208}
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
        fill="none"
      >
        {/* Unlock pulse: ripples that expand along the logo's orbital ring
            (the "Saturn ring"), synced to the key's turn. The group carries
            the ring's tilt; the ripples scale within it. */}
        <g transform="rotate(-21 88 89)">
          <ellipse
            className="ditto-ring-ripple"
            cx="88"
            cy="89"
            rx="83"
            ry="26"
            stroke="hsl(var(--primary))"
            strokeWidth="3.5"
            style={{ transformOrigin: '88px 89px' }}
          />
        </g>

        {/* Opaque disc over the planet area: hides the ripples where they'd
            cross the planet ("behind Saturn") without a mask, which would
            force per-frame repaints of the animating subtree. Invisible
            against the dialog's uniform background. Geometry measured from
            the logo paths: planet center (87.3, 88), outer radius ≈ 55.6. */}
        <circle cx="87.3" cy="88" r="56" fill="hsl(var(--background))" />

        {/* Keyhole at the planet's center, drawn in 3/4 perspective —
            squashed horizontally so its face angles toward the incoming
            key, making the side entry read correctly. A darker shade of
            the logo color, so it reads as a hole. */}
        <g
          fill="color-mix(in srgb, hsl(var(--primary)) 45%, black)"
          transform="translate(87 0) scale(0.82 1) translate(-87 0)"
        >
          <circle cx="87" cy="80" r="12" />
          <path d="M 81 88 L 93 88 L 98.5 107 H 75.5 Z" />
        </g>

        {/* Unlock success: the keyhole lights up white along with the ring. */}
        <g
          className="ditto-ring-success"
          fill="#fff"
          style={{ filter: 'drop-shadow(0 0 8px rgb(255 255 255 / 0.7))' }}
          transform="translate(87 0) scale(0.82 1) translate(-87 0)"
        >
          <circle cx="87" cy="80" r="12" />
          <path d="M 81 88 L 93 88 L 98.5 107 H 75.5 Z" />
        </g>
      </svg>

      {/* Pre-blurred glow layer: the same inline logo paths (no shine arcs)
          with a constant blur, so the unlock glow animates cheap opacity
          instead of an expensive per-frame drop-shadow filter. */}
      <svg
        viewBox="0 0 176 176"
        width={208}
        height={208}
        aria-hidden="true"
        className="ditto-hero-logo-glow absolute inset-0"
        style={{ filter: 'blur(10px)' }}
        fill="none"
      >
        <g transform="scale(1.76) translate(5 10)" fill="hsl(var(--primary))">
          {PLANET_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <path d={RING_PATH} />
        </g>
      </svg>

      {/* The logo, inlined from its source paths — planet arcs and orbital
          ring only, without the logo's little "shine" arcs. */}
      <svg
        viewBox="0 0 176 176"
        width={208}
        height={208}
        aria-label="Ditto"
        role="img"
        className="relative"
        fill="none"
      >
        <g transform="scale(1.76) translate(5 10)" fill="hsl(var(--primary))">
          {PLANET_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
          <path d={RING_PATH} />
        </g>
      </svg>

      <svg
        viewBox="0 0 176 176"
        width={208}
        height={208}
        aria-hidden="true"
        className="absolute inset-0 overflow-visible"
        fill="none"
      >
        {/* Unlock success: the logo's orbital ring itself lights up white,
            glowing as the key turns. */}
        <g
          className="ditto-ring-success"
          transform="scale(1.76) translate(5 10)"
          style={{ filter: 'drop-shadow(0 0 8px rgb(255 255 255 / 0.7))' }}
        >
          <path d={RING_PATH} fill="#fff" />
        </g>

        <defs>
          {/* The "going in" illusion: the key stays visible across the whole
              keyhole mouth and disappears exactly at the hole's far (right)
              rim — the curved edge — as if sliding into the lock's interior.
              The explicit userSpaceOnUse region keeps the mask from cropping
              the key's strokes (the default region is the tight fill
              bounding box). */}
          <mask id="ditto-hero-keyhole-mask" maskUnits="userSpaceOnUse" x="-48" y="-48" width="272" height="272">
            <rect x="-48" y="-48" width="272" height="272" fill="white" />
            <rect x="87" y="56" width="60" height="48" fill="black" />
            {/* The full keyhole opening — circle and bottom slot — stays
                see-through, so the key vanishes at the opening's far edge. */}
            <g transform="translate(87 0) scale(0.82 1) translate(-87 0)" fill="white">
              <circle cx="87" cy="80" r="12" />
              <path d="M 81 88 L 93 88 L 98.5 107 H 75.5 Z" />
            </g>
          </mask>
        </defs>

        {/* The key glides in from stage left in one motion. Its teeth sit
            near the tip, so they physically pass through the mouth and end
            up inside the lock (occluded by the mask) before the turn. The
            turn tweens the bow smoothly through its three poses — full
            ring, half-turned, edge-on — while the torque wrapper jabs the
            whole key a few degrees, like a wrist twisting it. */}
        <g mask="url(#ditto-hero-keyhole-mask)">
        <g className="ditto-key ditto-key-side">
          {/* Torque wrapper: the whole visible key jabs a few degrees
              around the mouth as the bow snaps through its turn cels —
              the wrist twist that sells the rotation. */}
          <g className="ditto-key-torque" style={{ transformOrigin: '87px 80px' }}>
            {/* Bow — a diamond ring (fantasy-key head). The turn animates
                the diamond's geometry itself (not a scale transform), so
                the 8-unit stroke — the metal — keeps constant thickness
                while the shape foreshortens to a ~75% rotation. */}
            <path
              d="M 26 80 L 42 64 L 58 80 L 42 96 Z"
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth="8"
              strokeLinejoin="round"
            >
              <animate
                attributeName="d"
                dur="3.2s"
                repeatCount="indefinite"
                calcMode="linear"
                keyTimes="0;0.4;0.43;0.46;1"
                values="M 26 80 L 42 64 L 58 80 L 42 96 Z;
                        M 26 80 L 42 64 L 58 80 L 42 96 Z;
                        M 26 80 L 42 68.8 L 58 80 L 42 91.2 Z;
                        M 26 80 L 42 72.8 L 58 80 L 42 87.2 Z;
                        M 26 80 L 42 72.8 L 58 80 L 42 87.2 Z"
              />
            </path>
            <g fill="hsl(var(--foreground))">
              {/* Shaft — a solid slab with rounded ends */}
              <rect x="54" y="76" width="59" height="8" rx="4" />
              {/* Two blocky teeth at the tip, the outer one flush with the
                  end — fully swallowed by the keyhole once seated */}
              <rect x="98.5" y="80" width="7" height="12" rx="2.5" />
              <rect x="106" y="80" width="7" height="15" rx="2.5" />
            </g>
          </g>
        </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * Scoped keyframes for the login hero. Inlined (rather than added to
 * tailwind.config) because they're specific to this vignette. Honors
 * `prefers-reduced-motion`.
 */
function LoginHeroKeyframes() {
  return (
    <style>{`
      .ditto-key-side {
        animation: ditto-key-side 3.2s ease-in-out infinite;
        opacity: 0;
        will-change: transform, opacity;
      }
      .ditto-key-torque {
        animation: ditto-key-torque 3.2s ease-in-out infinite;
      }
      .ditto-hero-logo-glow {
        animation: ditto-logo-glow 3.2s ease-in-out infinite;
        opacity: 0;
        will-change: opacity;
      }
      .ditto-ring-ripple {
        animation: ditto-ring-ripple 3.2s ease-out infinite;
        opacity: 0;
        will-change: transform, opacity;
      }
      .ditto-ring-success {
        animation: ditto-ring-success 3.2s ease-in-out infinite;
        opacity: 0;
        will-change: opacity;
      }
      /* The key glides in as one smooth motion — from stage left straight
         to full depth in the keyhole — holds through the turn, then fades
         before the loop restarts. */
      @keyframes ditto-key-side {
        0%        { transform: translateX(-52px); opacity: 0; }
        8%        { opacity: 1; }
        30%, 74%  { transform: translateX(0); opacity: 1; }
        84%, 100% { transform: translateX(0); opacity: 0; }
      }
      /* The wrist: a quick torque jab around the mouth during the cel
         snaps, easing back as the lock gives. */
      @keyframes ditto-key-torque {
        0%, 40%   { transform: rotate(0deg); }
        43%       { transform: rotate(5deg); }
        50%, 100% { transform: rotate(0deg); }
      }
      /* Unlock feedback, synced to the turn: the logo pulses a soft glow
         while ripples expand outward along the orbital ring and dissolve. */
      @keyframes ditto-logo-glow {
        0%, 40%   { opacity: 0; }
        48%       { opacity: 0.38; }
        74%, 100% { opacity: 0; }
      }
      @keyframes ditto-ring-ripple {
        0%, 40%   { opacity: 0; transform: scale(1); }
        45%       { opacity: 0.6; }
        72%, 100% { opacity: 0; transform: scale(1.24); }
      }
      /* The ring lights up in the success color as the key turns, holds,
         then dims before the loop restarts. */
      @keyframes ditto-ring-success {
        0%, 40%   { opacity: 0; }
        46%, 62%  { opacity: 0.9; }
        78%, 100% { opacity: 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        .ditto-key, .ditto-ring-ripple, .ditto-ring-success,
        .ditto-hero-logo-glow { display: none; }
        .ditto-key-side,
        .ditto-key-torque, .ditto-hero-logo { animation: none; }
      }
    `}</style>
  );
}
