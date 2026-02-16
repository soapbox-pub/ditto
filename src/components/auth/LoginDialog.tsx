// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useRef, useState, useEffect } from 'react';
import { Upload, AlertTriangle, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useLoginActions } from '@/hooks/useLoginActions';
import { DialogTitle } from '@radix-ui/react-dialog';

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: () => void;
}

const validateNsec = (nsec: string) => {
  return /^nsec1[a-zA-Z0-9]{58}$/.test(nsec);
};

const validateBunkerUri = (uri: string) => {
  return uri.startsWith('bunker://');
};

const LoginDialog: React.FC<LoginDialogProps> = ({ isOpen, onClose, onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isFileLoading, setIsFileLoading] = useState(false);
  const [nsec, setNsec] = useState('');
  const [bunkerUri, setBunkerUri] = useState('');
  const [errors, setErrors] = useState<{
    nsec?: string;
    bunker?: string;
    file?: string;
    extension?: string;
  }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const login = useLoginActions();

  // Reset all state when dialog opens/closes
  useEffect(() => {
    if (isOpen) {
      // Reset state when dialog opens
      setIsLoading(false);
      setIsFileLoading(false);
      setNsec('');
      setBunkerUri('');
      setErrors({});
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [isOpen]);

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
      console.error('Bunker login failed:', error);
      console.error('Nsec login failed:', error);
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

  const hasExtension = 'nostr' in window;
  const [isMoreOptionsOpen, setIsMoreOptionsOpen] = useState(false);

  const renderTabs = () => (
    <Tabs defaultValue="key" className="w-full">
      <TabsList className="grid w-full grid-cols-2 bg-muted/80 rounded-lg mb-4">
        <TabsTrigger value="key" className="flex items-center gap-2">
          <span>Secret Key</span>
        </TabsTrigger>
        <TabsTrigger value="bunker" className="flex items-center gap-2">
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

      <TabsContent value='bunker' className='space-y-4'>
        <form onSubmit={(e) => {
          e.preventDefault();
          handleBunkerLogin();
        }} className='space-y-4'>
          <div className='space-y-2'>
            <Input
              id='bunkerUri'
              value={bunkerUri}
              onChange={(e) => {
                setBunkerUri(e.target.value);
                if (errors.bunker) setErrors(prev => ({ ...prev, bunker: undefined }));
              }}
              className={`rounded-lg border-gray-300 dark:border-gray-700 focus-visible:ring-primary ${
                errors.bunker ? 'border-red-500' : ''
              }`}
              placeholder='bunker://'
              autoComplete="off"
            />
            {errors.bunker && (
              <p className="text-sm text-red-500">{errors.bunker}</p>
            )}
          </div>

          <Button
            type="submit"
            size="lg"
            className='w-full'
            disabled={isLoading || !bunkerUri.trim()}
          >
            {isLoading ? 'Connecting...' : 'Log in'}
          </Button>
        </form>
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
          {/* Extension Login Button - shown if extension is available */}
          {hasExtension && (
            <div className="space-y-4">
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
              <CollapsibleTrigger asChild>
                <button className="w-full flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <span>More Options</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${isMoreOptionsOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>

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
