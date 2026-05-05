// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Upload, AlertTriangle, ChevronDown, ChevronUp, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
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
  const [isLoading, setIsLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [nostrConnectParams, setNostrConnectParams] = useState<NostrConnectParams | null>(null);
  const [nostrConnectUri, setNostrConnectUri] = useState<string>('');
  const [connectError, setConnectError] = useState<string | null>(null);
  // Progress status for the nostrconnect handshake. `null` means the user
  // hasn't kicked off the handshake yet (or they canceled/retried) — we show
  // the QR / "Open Signer App" button. Once the handshake advances we swap
  // the QR/button area for a spinner with a live-updating status line, so
  // the user knows something is happening while the signer app is working.
  const [connectStatus, setConnectStatus] = useState<NostrConnectStatus | null>(null);
  // Tracks whether the user has explicitly initiated the handshake from the
  // mobile UI (tapped "Open Signer App"). The subscription itself starts
  // listening as soon as params are generated — without this flag we'd flip
  // the dialog into the progress view the moment the user enters the Remote
  // Signer tab, before they've done anything. Desktop doesn't need this:
  // it stays on the QR until the handshake advances past `awaiting-connect`.
  const [hasOpenedSigner, setHasOpenedSigner] = useState(false);
  const [showBunkerInput, setShowBunkerInput] = useState(false);
  const [errors, setErrors] = useState<{
    nsec?: string;
    bunker?: string;
    file?: string;
    extension?: string;
  }>({});
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
  // Check if extension is available
  const hasExtension = 'nostr' in window;

  // Generate nostrconnect params (sync) - just creates the QR code data
  const generateConnectSession = useCallback(() => {
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
    // explicitly by the `isOpen` effect and by handleRetry().
  }, [nostrConnectParams]);

  // Clean up on close
  useEffect(() => {
    if (!isOpen) {
      setNostrConnectParams(null);
      setNostrConnectUri('');
      setConnectError(null);
      setConnectStatus(null);
      setHasOpenedSigner(false);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    }
  }, [isOpen]);

  // Retry connection with new params
  const handleRetry = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setNostrConnectParams(null);
    setNostrConnectUri('');
    setConnectError(null);
    setConnectStatus(null);
    setHasOpenedSigner(false);
    // Generate new session after state clears
    setTimeout(() => generateConnectSession(), 0);
  }, [generateConnectSession]);

  // When the app resumes from background (after signer app), poll for the response
  // Open the nostrconnect URI in the system - this will launch a signer app like Amber if installed
  const handleOpenSignerApp = () => {
    if (!nostrConnectUri) return;
    // Flip into the progress view *synchronously* before navigating so that
    // when the user returns from the signer app, the dialog is already
    // showing "Waiting for signer connection…" — not the original button
    // they're worried they need to re-tap.
    setHasOpenedSigner(true);
    window.location.href = nostrConnectUri;
  };

  const handleExtensionLogin = async () => {
    setIsLoading(true);
    setErrors(prev => ({ ...prev, extension: undefined }));

    try {
      if (!('nostr' in window)) {
        throw new Error('Nostr extension not found. Please install a NIP-07 extension.');
      }
      await login.extension();
      onLogin();
      onClose();
    } catch (e: unknown) {
      const error = e as Error;
      console.error('Extension login failed:', error);
      setErrors(prev => ({
        ...prev,
        extension: error instanceof Error ? error.message : 'Extension login failed'
      }));
    } finally {
      setIsLoading(false);
    }
  };


  const executeLogin = (key: string) => {
    setIsLoading(true);
    setErrors({});

    // Use a timeout to allow the UI to update before the synchronous login call
    setTimeout(() => {
      try {
        login.nsec(key);
        onLogin();
        onClose();
      } catch {
        setErrors({ nsec: "Failed to login with this key. Please check that it's correct." });
        setIsLoading(false);
      }
    }, 50);
  };

  const handleKeyLogin = () => {
    if (!nsec.trim()) {
      setErrors(prev => ({ ...prev, nsec: 'Please enter your secret key' }));
      return;
    }

    if (!validateNsec(nsec)) {
      setErrors(prev => ({ ...prev, nsec: 'Invalid secret key format. Must be a valid nsec starting with nsec1.' }));
      return;
    }
    executeLogin(nsec);
  };

  const handleBunkerLogin = async () => {
    if (!bunkerUri.trim()) {
      setErrors(prev => ({ ...prev, bunker: 'Please enter a bunker URI' }));
      return;
    }

    if (!validateBunkerUri(bunkerUri)) {
      setErrors(prev => ({ ...prev, bunker: 'Invalid bunker URI format. Must start with bunker://' }));
      return;
    }

    setIsLoading(true);
    setErrors(prev => ({ ...prev, bunker: undefined }));

    try {
      await login.bunker(bunkerUri);
      onLogin();
      onClose();
      // Clear the URI from memory
      setBunkerUri('');
    } catch {
      setErrors(prev => ({
        ...prev,
        bunker: 'Failed to connect to bunker. Please check the URI.'
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileLoading(true);
    setErrors({});

    const reader = new FileReader();
    reader.onload = (event) => {
      setIsFileLoading(false);
      const content = event.target?.result as string;
      if (content) {
        const trimmedContent = content.trim();
        if (validateNsec(trimmedContent)) {
          executeLogin(trimmedContent);
        } else {
          setErrors({ file: 'File does not contain a valid secret key.' });
        }
      } else {
        setErrors({ file: 'Could not read file content.' });
      }
    };
    reader.onerror = () => {
      setIsFileLoading(false);
      setErrors({ file: 'Failed to read file.' });
    };
    reader.readAsText(file);
  };

  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

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

  // Decide whether to render the progress view in place of the QR/button.
  // Mobile: flip in as soon as the user taps "Open Signer App" (tracked by
  // `hasOpenedSigner`) so they see feedback the moment they return from the
  // signer. Desktop: keep the QR visible while waiting for the signer (it's
  // still actionable — they might scan it with a different device) and only
  // swap once the signer has acknowledged and we're fetching the pubkey.
  const showProgressView = connectStatus !== null && (
    connectStatus === 'getting-public-key' ||
    (isMobile && hasOpenedSigner)
  );

  const renderTabs = () => (
    <Tabs 
      defaultValue="key" 
      className="w-full"
      onValueChange={(value) => {
        if (value === 'remote' && !nostrConnectParams && !connectError) {
          generateConnectSession();
        }
      }}
    >
      <TabsList className="grid w-full grid-cols-2 bg-muted/80 rounded-lg mb-4">
        <TabsTrigger value="key" className="flex items-center gap-2">
          <span>Secret Key</span>
        </TabsTrigger>
        <TabsTrigger value="remote" className="flex items-center gap-2">
          <span>Remote Signer</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value='key' className='space-y-4'>
        <form onSubmit={(e) => {
          e.preventDefault();
          handleKeyLogin();
        }} className='space-y-4'>
          <div className='space-y-2'>
            <Input
              id='nsec'
              type="password"
              value={nsec}
              onChange={(e) => {
                setNsec(e.target.value);
                if (errors.nsec) setErrors(prev => ({ ...prev, nsec: undefined }));
              }}
              className={`rounded-lg ${
                errors.nsec ? 'border-red-500 focus-visible:ring-red-500' : ''
              }`}
              placeholder='nsec1...'
              autoComplete="off"
            />
            {errors.nsec && (
              <p className="text-sm text-red-500">{errors.nsec}</p>
            )}
          </div>

          <div className="flex space-x-2">
            <Button
              type="submit"
              size="lg"
              disabled={isLoading || !nsec.trim()}
              className="flex-1"
            >
              {isLoading ? 'Verifying...' : 'Log in'}
            </Button>

            <input
              type="file"
              accept=".txt"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading || isFileLoading}
              className="px-3"
            >
              <Upload className="w-4 h-4" />
            </Button>
          </div>

          {errors.file && (
            <p className="text-sm text-red-500 text-center">{errors.file}</p>
          )}
        </form>
      </TabsContent>

      <TabsContent value='remote' className='space-y-4'>
        {/* Nostrconnect Section */}
        <div className='flex flex-col items-center space-y-4'>
          {connectError ? (
            <div className='flex flex-col items-center space-y-4 py-4'>
              <p className='text-sm text-red-500 text-center'>{connectError}</p>
              <Button variant='outline' onClick={handleRetry}>
                Retry
              </Button>
            </div>
          ) : showProgressView ? (
            // Progress view — replaces the QR/button once the handshake is
            // under way. Gives the user live feedback through each phase so
            // a stuck signer is visibly stuck, not silently stuck.
            <div className='flex flex-col items-center space-y-4 py-6 w-full'>
              <Loader2 className='w-8 h-8 animate-spin text-primary' />
              <p className='text-sm text-muted-foreground text-center min-h-[1.25rem]'>
                {connectStatusLabel(connectStatus)}
              </p>
              <button
                type='button'
                onClick={handleRetry}
                className='text-sm text-primary hover:underline underline-offset-4 font-medium'
              >
                Cancel
              </button>
            </div>
          ) : nostrConnectUri ? (
            <>
              {/* QR Code - only show on desktop */}
              {!isMobile && (
                <div className='p-4 bg-white dark:bg-white rounded-xl'>
                  <QRCodeCanvas
                    value={nostrConnectUri}
                    size={180}
                    level='M'
                  />
                </div>
              )}

              {/* Open Signer App button - primary action on mobile */}
              {isMobile && (
                <Button
                  className='w-full gap-2 py-6 rounded-full'
                  onClick={handleOpenSignerApp}
                >
                  <ExternalLink className='w-5 h-5' />
                  Open Signer App
                </Button>
              )}
            </>
          ) : (
            <div className='flex items-center justify-center h-[100px]'>
              <Loader2 className='w-8 h-8 animate-spin text-muted-foreground' />
            </div>
          )}
        </div>

        {/* Manual URI input section - collapsible */}
        <div className='pt-4 border-t border-gray-200 dark:border-gray-700'>
          <button
            type='button'
            onClick={() => setShowBunkerInput(!showBunkerInput)}
            className='flex items-center justify-center gap-2 w-full text-sm text-muted-foreground hover:text-foreground transition-colors py-2'
          >
            <span>Enter bunker URI manually</span>
            {showBunkerInput ? (
              <ChevronUp className='w-4 h-4' />
            ) : (
              <ChevronDown className='w-4 h-4' />
            )}
          </button>

          {showBunkerInput && (
            <div className='space-y-3 mt-3'>
              <div className='space-y-2'>
                <Input
                  id='connectBunkerUri'
                  value={bunkerUri}
                  onChange={(e) => setBunkerUri(e.target.value)}
                  className='rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary text-base md:text-sm'
                  placeholder='bunker://'
                />
                {bunkerUri && !validateBunkerUri(bunkerUri) && (
                  <p className='text-red-500 text-xs'>Invalid bunker URI format</p>
                )}
              </div>

              <Button
                className='w-full rounded-full py-4'
                variant='outline'
                onClick={handleBunkerLogin}
                disabled={isLoading || !bunkerUri.trim() || !validateBunkerUri(bunkerUri)}
              >
                {isLoading ? 'Connecting...' : 'Connect'}
              </Button>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );

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
          {onSignupClick && (
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

          {/* Extension Login Button - shown if extension is available */}
          {hasExtension && (
            <div className="space-y-3">
              {errors.extension && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>{errors.extension}</AlertDescription>
                </Alert>
              )}
              <Button
                className="w-full h-12 px-9"
                onClick={handleExtensionLogin}
                disabled={isLoading}
              >
                {isLoading ? 'Logging in...' : 'Log in with Extension'}
              </Button>
            </div>
          )}

          {/* Tabs - wrapped in collapsible if extension is available, otherwise shown directly */}
          {hasExtension ? (
            <Collapsible className="space-y-4" open={isMoreOptionsOpen} onOpenChange={setIsMoreOptionsOpen}>
              <button 
                type="button"
                onClick={() => setIsMoreOptionsOpen(!isMoreOptionsOpen)}
                className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                <span>More Options</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isMoreOptionsOpen ? 'rotate-180' : ''}`} />
              </button>

              <CollapsibleContent>
                {renderTabs()}
              </CollapsibleContent>
            </Collapsible>
          ) : (
            renderTabs()
          )}
        </div>
      </DialogContent>
    </Dialog>
    );
  };

export default LoginDialog;
