import { useState, useCallback, useMemo, useRef } from 'react';
import { Award, Upload, Loader2, Check, Copy, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';


import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AwardBadgeDialog } from '@/components/AwardBadgeDialog';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useCreateBadge } from '@/hooks/useCreateBadge';
import { useAwardBadge } from '@/hooks/useAwardBadge';
import { useAcceptBadge } from '@/hooks/useAcceptBadge';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { BADGE_DEFINITION_KIND } from '@/lib/badgeUtils';

/** Convert a badge name into a URL-safe slug for the d-tag identifier. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface CreateBadgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateBadgeDialog({ open, onOpenChange }: CreateBadgeDialogProps) {
  const { user } = useCurrentUser();
  const { toast } = useToast();

  // Form state
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Post-creation state
  const [createdBadge, setCreatedBadge] = useState<NostrEvent | null>(null);
  const [awardDialogOpen, setAwardDialogOpen] = useState(false);
  const [selfAwarded, setSelfAwarded] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mutations
  const { mutateAsync: createBadge, isPending: isCreating } = useCreateBadge();
  const { mutateAsync: awardBadge, isPending: isAwardingSelf } = useAwardBadge();
  const { mutateAsync: acceptBadge } = useAcceptBadge();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();

  // Derived values
  const effectiveIdentifier = identifierTouched ? identifier : slugify(name);

  const badgeATag = useMemo(() => {
    if (!createdBadge) return '';
    const dTag = createdBadge.tags.find(([n]) => n === 'd')?.[1] ?? '';
    return `${BADGE_DEFINITION_KIND}:${createdBadge.pubkey}:${dTag}`;
  }, [createdBadge]);

  const badgeName = useMemo(() => {
    if (!createdBadge) return '';
    return createdBadge.tags.find(([n]) => n === 'name')?.[1] ?? '';
  }, [createdBadge]);

  const resetForm = useCallback(() => {
    setName('');
    setIdentifier('');
    setIdentifierTouched(false);
    setDescription('');
    setImageUrl('');
    setImagePreview('');
    setCreatedBadge(null);
    setSelfAwarded(false);
    setCopied(false);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  // Handlers
  const handleNameChange = useCallback((value: string) => {
    setName(value);
    if (!identifierTouched) {
      setIdentifier(slugify(value));
    }
  }, [identifierTouched]);

  const handleIdentifierChange = useCallback((value: string) => {
    setIdentifierTouched(true);
    setIdentifier(value);
  }, []);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file.', variant: 'destructive' });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
    try {
      const [[, url]] = await uploadFile(file);
      setImageUrl(url);
      toast({ title: 'Image uploaded' });
    } catch {
      setImagePreview('');
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    }
  }, [uploadFile, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const handleCreate = useCallback(async () => {
    if (!name.trim() || !effectiveIdentifier.trim()) return;
    try {
      const event = await createBadge({
        name: name.trim(),
        identifier: effectiveIdentifier.trim(),
        description: description.trim() || undefined,
        imageUrl: imageUrl || undefined,
      });
      setCreatedBadge(event);
      toast({ title: 'Badge created!' });
    } catch {
      toast({ title: 'Failed to create badge', description: 'Please try again.', variant: 'destructive' });
    }
  }, [name, effectiveIdentifier, description, imageUrl, createBadge, toast]);

  const handleSelfAward = useCallback(async () => {
    if (!user || !createdBadge || !badgeATag) return;
    try {
      const awardEvent = await awardBadge({
        aTag: badgeATag,
        recipientPubkeys: [user.pubkey],
      });
      await acceptBadge({
        aTag: badgeATag,
        awardEventId: awardEvent.id,
      });
      setSelfAwarded(true);
      toast({ title: 'Badge awarded to yourself!' });
    } catch {
      toast({ title: 'Failed to self-award', description: 'Please try again.', variant: 'destructive' });
    }
  }, [user, createdBadge, badgeATag, awardBadge, acceptBadge, toast]);

  const handleCopyLink = useCallback(() => {
    if (!createdBadge) return;
    const dTag = createdBadge.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const naddr = nip19.naddrEncode({
      kind: BADGE_DEFINITION_KIND,
      pubkey: createdBadge.pubkey,
      identifier: dTag,
    });
    navigator.clipboard.writeText(`${window.location.origin}/${naddr}`);
    setCopied(true);
    toast({ title: 'Link copied to clipboard!' });
    setTimeout(() => setCopied(false), 2000);
  }, [createdBadge, toast]);

  if (!user) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
          {createdBadge ? (
            /* ── Success state ── */
            <div className="py-8 px-6 text-center">
              <div className="space-y-5">
                <div className="inline-flex items-center justify-center size-14 rounded-full bg-green-500/10 mx-auto">
                  <Check className="size-7 text-green-500" />
                </div>

                <div className="space-y-1">
                  <h2 className="text-lg font-bold">Badge Created!</h2>
                  <p className="text-sm text-muted-foreground">
                    "{badgeName}" is ready to be awarded.
                  </p>
                </div>

                {imageUrl && (
                  <div className="mx-auto w-20 h-20 rounded-xl overflow-hidden">
                    <img src={imageUrl} alt={badgeName} className="w-full h-full object-cover" />
                  </div>
                )}

                <div className="grid gap-2 max-w-xs mx-auto">
                  <Button
                    onClick={handleSelfAward}
                    disabled={selfAwarded || isAwardingSelf}
                    variant={selfAwarded ? 'outline' : 'default'}
                    className="gap-2"
                    size="sm"
                  >
                    {isAwardingSelf ? (
                      <><Loader2 className="size-4 animate-spin" /> Awarding...</>
                    ) : selfAwarded ? (
                      <><Check className="size-4" /> Awarded to Yourself</>
                    ) : (
                      <><Award className="size-4" /> Award to Yourself</>
                    )}
                  </Button>

                  <Button variant="outline" size="sm" onClick={() => setAwardDialogOpen(true)} className="gap-2">
                    <Users className="size-4" />
                    Award to Others
                  </Button>

                  <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-2">
                    {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                    {copied ? 'Copied!' : 'Share Link'}
                  </Button>

                  <Button variant="ghost" size="sm" onClick={resetForm} className="gap-2 text-muted-foreground">
                    Create Another
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            /* ── Creation form ── */
            <>
              <DialogHeader className="px-5 pt-5 pb-3">
                <DialogTitle className="flex items-center gap-2">
                  <Award className="size-5 text-primary" />
                  Create a Badge
                </DialogTitle>
                <DialogDescription>
                  Design a NIP-58 badge to award to users.
                </DialogDescription>
              </DialogHeader>

              <ScrollArea className="max-h-[60vh]">
                <div className="px-5 pb-5 space-y-4">
                  {/* Image upload */}
                  <div className="space-y-1.5">
                    <Label>Badge Image</Label>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onDrop={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                      className="relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-xl bg-secondary/5 hover:bg-secondary/10 transition-colors cursor-pointer overflow-hidden"
                    >
                      {imagePreview ? (
                        <img src={imagePreview} alt="Badge preview" className="w-full h-full object-contain" />
                      ) : isUploading ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Loader2 className="size-6 animate-spin" />
                          <span className="text-xs">Uploading...</span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Upload className="size-6 opacity-40" />
                          <span className="text-xs">Drop an image or click to upload</span>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileSelect(file);
                        }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Recommended aspect ratio is 1:1 (max 1024x1024 px).
                    </p>
                  </div>

                  {/* Badge name */}
                  <div className="space-y-1.5">
                    <Label htmlFor="badge-name">Badge Name *</Label>
                    <Input
                      id="badge-name"
                      placeholder="e.g. Early Adopter"
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                    />
                  </div>

                  {/* Identifier / d-tag */}
                  <div className="space-y-1.5">
                    <Label htmlFor="badge-identifier">Identifier (d-tag)</Label>
                    <Input
                      id="badge-identifier"
                      placeholder="auto-generated-slug"
                      value={identifierTouched ? identifier : effectiveIdentifier}
                      onChange={(e) => handleIdentifierChange(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      URL-safe identifier. Auto-generated from the name.
                    </p>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <Label htmlFor="badge-description">Description</Label>
                    <Textarea
                      id="badge-description"
                      placeholder="What is this badge awarded for?"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={2}
                    />
                  </div>

                  {/* Create button */}
                  <Button
                    onClick={handleCreate}
                    disabled={!name.trim() || !effectiveIdentifier.trim() || isCreating || isUploading}
                    className="w-full gap-2"
                  >
                    {isCreating ? (
                      <><Loader2 className="size-4 animate-spin" /> Creating...</>
                    ) : (
                      <><Award className="size-4" /> Create Badge</>
                    )}
                  </Button>
                </div>
              </ScrollArea>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Nested award dialog for post-creation flow */}
      <AwardBadgeDialog
        open={awardDialogOpen}
        onOpenChange={setAwardDialogOpen}
        badgeATag={badgeATag}
        badgeName={badgeName}
      />
    </>
  );
}
