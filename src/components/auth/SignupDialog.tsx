// NOTE: This file is stable and usually should not be modified.
// It is important that all functionality in this file is preserved, and should only be modified if explicitly requested.

import React, { useState, useEffect, useRef } from 'react';
import { Download, Eye, EyeOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from '@/hooks/useToast';
import { useLoginActions } from '@/hooks/useLoginActions';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { generateSecretKey, getPublicKey, nip19 } from 'nostr-tools';
import { ProfileCard } from '@/components/ProfileCard';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import type { NostrMetadata } from '@nostrify/nostrify';

interface SignupDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const SignupDialog: React.FC<SignupDialogProps> = ({ isOpen, onClose }) => {
  const [step, setStep] = useState<'generate' | 'download' | 'profile'>('generate');
  const [nsec, setNsec] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [profileData, setProfileData] = useState<Partial<NostrMetadata>>({
    name: '',
    about: '',
    picture: '',
    banner: '',
  });
  const [cropState, setCropState] = useState<{ imageSrc: string; aspect: number; field: 'picture' | 'banner' } | null>(null);
  const pickInputRef = useRef<HTMLInputElement>(null);
  const pendingField = useRef<'picture' | 'banner'>('picture');
  const login = useLoginActions();
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

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

  const handlePickImage = (field: 'picture' | 'banner') => {
    pendingField.current = field;
    pickInputRef.current?.click();
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const field = pendingField.current;
    setCropState({ imageSrc: URL.createObjectURL(file), aspect: field === 'picture' ? 1 : 3, field });
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!cropState) return;
    const { field, imageSrc } = cropState;
    URL.revokeObjectURL(imageSrc);
    setCropState(null);
    try {
      const file = new File([blob], `${field}.jpg`, { type: 'image/jpeg' });
      const [[, url]] = await uploadFile(file);
      setProfileData(prev => ({ ...prev, [field]: url }));
    } catch {
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const handleCropCancel = () => {
    if (cropState) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  };

  const finishSignup = async (skipProfile = false) => {
    try {
      if (!skipProfile && (profileData.name || profileData.about || profileData.picture)) {
        await publishEvent({
          kind: 0,
          content: JSON.stringify(profileData),
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
                  className="pr-10 font-mono"
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
            <div className='space-y-4'>
              <input ref={pickInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChosen} />
              {cropState && (
                <ImageCropDialog
                  open
                  imageSrc={cropState.imageSrc}
                  aspect={cropState.aspect}
                  title={cropState.field === 'picture' ? 'Crop Profile Picture' : 'Crop Banner'}
                  onCancel={handleCropCancel}
                  onCrop={handleCropConfirm}
                />
              )}

              <div className={isPublishing ? 'opacity-50 pointer-events-none' : ''}>
                <ProfileCard
                  metadata={profileData}
                  onChange={(patch) => setProfileData(prev => ({ ...prev, ...patch }))}
                  onPickImage={handlePickImage}
                />
              </div>

              {isUploading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Uploading image…
                </div>
              )}

              <div className='space-y-2'>
                <Button className='w-full' onClick={() => finishSignup(false)} disabled={isPublishing || isUploading}>
                  {isPublishing ? <><Loader2 className="size-4 mr-2 animate-spin" /> Creating Profile…</> : 'Create profile'}
                </Button>
                <Button variant='outline' className='w-full' onClick={() => finishSignup(true)} disabled={isPublishing || isUploading}>
                  Skip for now
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
