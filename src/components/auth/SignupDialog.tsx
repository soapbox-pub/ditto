// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useState, useEffect, useRef } from 'react';
import { Download, Upload, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from '@/hooks/useToast';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';

interface SignupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignupDialog: React.FC<SignupDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'generate' | 'download' | 'profile'>('generate');
  const [nsec, setNsec] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [profileData, setProfileData] = useState({
    name: '',
    about: '',
    picture: ''
  });
  const login = useLoginActions();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  // Generate a proper nsec key using nostr-tools
  const generateKey = () => {
    const sk = generateSecretKey();
    setNsec(nip19.nsecEncode(sk));
    setStep('download');
  };

  const downloadKey = () => {
    try {
      // Create a blob with the key text
      const blob = new Blob([nsec], { type: 'text/plain; charset=utf-8' });
      const url = globalThis.URL.createObjectURL(blob);

      const decoded = nip19.decode(nsec);
      if (decoded.type !== 'nsec') {
        throw new Error('Invalid nsec key');
      }

      const pubkey = getPublicKey(decoded.data);
      const npub = nip19.npubEncode(pubkey);
      const filename = `nostr-${location.hostname.replaceAll(/\./g, '-')}-${npub.slice(5, 9)}.nsec.txt`;

      // Create a temporary link element and trigger download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();

      // Clean up immediately
      globalThis.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Continue to profile step
      login.nsec(nsec);
      setStep('profile');
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not download the key file. Please copy it manually.',
        variant: 'destructive',
      });
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input
    e.target.value = '';

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file type',
        description: 'Please select an image file for your avatar.',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Avatar image must be smaller than 5MB.',
        variant: 'destructive',
      });
      return;
    }

    try {
      const tags = await uploadFile(file);
      // Get the URL from the first tag
      const url = tags[0]?.[1];
      if (url) {
        setProfileData(prev => ({ ...prev, picture: url }));
      }
    } catch {
      toast({
        title: 'Upload failed',
        description: 'Failed to upload avatar. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const finishSignup = async (skipProfile = false) => {
    try {
      // Publish profile if user provided information
      if (!skipProfile && (profileData.name || profileData.about || profileData.picture)) {
        const metadata: Record<string, string> = {};
        if (profileData.name) metadata.name = profileData.name;
        if (profileData.about) metadata.about = profileData.about;
        if (profileData.picture) metadata.picture = profileData.picture;

        await publishEvent({
          kind: 0,
          content: JSON.stringify(metadata),
        });
      }
    } catch {
      toast({
        title: 'Profile Setup Failed',
        description: 'Your account was created but profile setup failed. You can update it later.',
        variant: 'destructive',
      });
    } finally {
      onClose();
    }
  };

  const getTitle = () => {
    if (step === 'generate') return 'Sign up';
    if (step === 'download') return 'Secret Key';
    if (step === 'profile') return 'Create Your Profile';
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('generate');
      setNsec('');
      setShowKey(false);
      setProfileData({ name: '', about: '', picture: '' });
    }
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] sm:max-w-sm max-h-[90dvh] p-0 gap-6 overflow-hidden rounded-2xl overflow-y-auto">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-lg font-semibold leading-none tracking-tight text-center">
            {getTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className='px-6 pb-6 space-y-4 overflow-y-auto flex-1'>
          {/* Generate Step */}
          {step === 'generate' && (
            <div className='text-center space-y-6'>
              <div className="flex size-40 text-8xl bg-primary/10 rounded-full items-center justify-center justify-self-center">
                🔑
              </div>

              <Button className="w-full h-12 px-9" onClick={generateKey}>
                Generate key
              </Button>
            </div>
          )}

          {/* Download Step */}
          {step === 'download' && (
            <div className='space-y-4'>
              <div className="flex size-16 text-4xl bg-primary/10 rounded-full items-center justify-center justify-self-center">
                🔑
              </div>

              <div className="relative">
                <Input
                  type={showKey ? "text" : "password"}
                  value={nsec}
                  readOnly
                  className="pr-10 font-mono text-sm"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>

              <Button
                className="w-full h-12 px-9"
                onClick={downloadKey}
              >
                <Download className="size-4" />
                Download key
              </Button>

              <div className='mx-auto max-w-sm'>
                <div className='p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800'>
                  <div className='flex items-center gap-2 mb-1'>
                    <span className='text-xs font-semibold text-amber-800 dark:text-amber-200'>
                      Important Warning
                    </span>
                  </div>
                  <p className='text-xs text-amber-900 dark:text-amber-300'>
                    This key is your primary and only means of accessing your account. Store it safely and securely. Please download your key to continue.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Profile Step */}
          {step === 'profile' && (
            <div className='text-center space-y-4'>
              {/* Publishing status indicator */}
              {isPublishing && (
                <div className='p-4 rounded-lg bg-muted border'>
                  <div className='flex items-center justify-center gap-3'>
                    <div className='w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin' />
                    <span className='text-sm font-medium'>
                      Publishing your profile...
                    </span>
                  </div>
                </div>
              )}

              {/* Profile form */}
              <div className={`space-y-4 text-left ${isPublishing ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className='space-y-2'>
                  <label htmlFor='profile-name' className='text-sm font-medium'>
                    Display Name
                  </label>
                  <Input
                    id='profile-name'
                    value={profileData.name}
                    onChange={(e) => setProfileData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder='Your name'
                    disabled={isPublishing}
                  />
                </div>

                <div className='space-y-2'>
                  <label htmlFor='profile-about' className='text-sm font-medium'>
                    Bio
                  </label>
                  <Textarea
                    id='profile-about'
                    value={profileData.about}
                    onChange={(e) => setProfileData(prev => ({ ...prev, about: e.target.value }))}
                    placeholder='Tell others about yourself...'
                    className='resize-none'
                    rows={3}
                    disabled={isPublishing}
                  />
                </div>

                <div className='space-y-2'>
                  <label htmlFor='profile-picture' className='text-sm font-medium'>
                    Avatar
                  </label>
                  <div className='flex gap-2'>
                    <Input
                      id='profile-picture'
                      value={profileData.picture}
                      onChange={(e) => setProfileData(prev => ({ ...prev, picture: e.target.value }))}
                      placeholder='https://example.com/your-avatar.jpg'
                      className='flex-1'
                      disabled={isPublishing}
                    />
                    <input
                      type='file'
                      accept='image/*'
                      className='hidden'
                      ref={avatarFileInputRef}
                      onChange={handleAvatarUpload}
                    />
                    <Button
                      type='button'
                      variant='outline'
                      size='icon'
                      onClick={() => avatarFileInputRef.current?.click()}
                      disabled={isUploading || isPublishing}
                      title='Upload avatar image'
                    >
                      {isUploading ? (
                        <div className='w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin' />
                      ) : (
                        <Upload className='w-4 h-4' />
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className='space-y-3'>
                <Button
                  className='w-full'
                  onClick={() => finishSignup(false)}
                  disabled={isPublishing || isUploading}
                >
                  {isPublishing ? (
                    <>
                      <div className='w-4 h-4 mr-2 border-2 border-current border-t-transparent rounded-full animate-spin' />
                      Creating Profile...
                    </>
                  ) : (
                    'Create profile'
                  )}
                </Button>

                <Button
                  variant='outline'
                  className='w-full'
                  onClick={() => finishSignup(true)}
                  disabled={isPublishing || isUploading}
                >
                  {isPublishing ? (
                    'Setting up account...'
                  ) : (
                    'Skip for now'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SignupDialog;
