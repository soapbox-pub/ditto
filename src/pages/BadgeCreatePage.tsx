import { useState, useCallback, useMemo, useRef } from 'react';
import { Award, Upload, Loader2, Check, Share, Copy, Users } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { useSeoMeta } from '@unhead/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginArea } from '@/components/auth/LoginArea';
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

export function BadgeCreatePage() {
  useSeoMeta({ title: 'Create a Badge' });

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

    // Show local preview immediately
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

  const handleReset = useCallback(() => {
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

  // Logged-out state
  if (!user) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16">
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center">
            <div className="max-w-sm mx-auto space-y-6">
              <Award className="size-12 mx-auto text-muted-foreground/40" />
              <div className="space-y-2">
                <h2 className="text-lg font-bold">Log in to create badges</h2>
                <p className="text-sm text-muted-foreground">
                  Sign in with your Nostr account to create and award badges.
                </p>
              </div>
              <LoginArea className="justify-center" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Post-creation success state
  if (createdBadge) {
    return (
      <div className="max-w-lg mx-auto px-4 py-8">
        <Card>
          <CardContent className="py-10 px-6 text-center">
            <div className="space-y-6">
              {/* Success indicator */}
              <div className="inline-flex items-center justify-center size-16 rounded-full bg-green-500/10 mx-auto">
                <Check className="size-8 text-green-500" />
              </div>

              <div className="space-y-1">
                <h2 className="text-xl font-bold">Badge Created!</h2>
                <p className="text-sm text-muted-foreground">
                  "{badgeName}" is ready to be awarded.
                </p>
              </div>

              {/* Badge preview */}
              {imageUrl && (
                <div className="mx-auto w-24 h-24 rounded-xl overflow-hidden bg-secondary/10 border border-border">
                  <img src={imageUrl} alt={badgeName} className="w-full h-full object-cover" />
                </div>
              )}

              {/* Action buttons */}
              <div className="grid gap-2.5 max-w-xs mx-auto">
                <Button
                  onClick={handleSelfAward}
                  disabled={selfAwarded || isAwardingSelf}
                  variant={selfAwarded ? 'outline' : 'default'}
                  className="gap-2"
                >
                  {isAwardingSelf ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Awarding...
                    </>
                  ) : selfAwarded ? (
                    <>
                      <Check className="size-4" />
                      Awarded to Yourself
                    </>
                  ) : (
                    <>
                      <Award className="size-4" />
                      Award to Yourself
                    </>
                  )}
                </Button>

                <Button
                  variant="outline"
                  onClick={() => setAwardDialogOpen(true)}
                  className="gap-2"
                >
                  <Users className="size-4" />
                  Award to Others
                </Button>

                <Button
                  variant="outline"
                  onClick={handleCopyLink}
                  className="gap-2"
                >
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? 'Copied!' : 'Share Link'}
                </Button>

                <Button
                  variant="ghost"
                  onClick={handleReset}
                  className="gap-2 text-muted-foreground"
                >
                  <Share className="size-4" />
                  Create Another
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <AwardBadgeDialog
          open={awardDialogOpen}
          onOpenChange={setAwardDialogOpen}
          badgeATag={badgeATag}
          badgeName={badgeName}
        />
      </div>
    );
  }

  // Creation form
  return (
    <div className="max-w-lg mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="inline-flex items-center justify-center size-10 rounded-xl bg-primary/10">
          <Award className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold leading-tight">Create a Badge</h1>
          <p className="text-sm text-muted-foreground">Design a NIP-58 badge to award to users.</p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Badge Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Image upload */}
          <div className="space-y-2">
            <Label>Badge Image</Label>
            <div
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              className="relative flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-border rounded-xl bg-secondary/5 hover:bg-secondary/10 transition-colors cursor-pointer overflow-hidden"
            >
              {imagePreview ? (
                <img
                  src={imagePreview}
                  alt="Badge preview"
                  className="w-full h-full object-contain"
                />
              ) : isUploading ? (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-8 animate-spin" />
                  <span className="text-sm">Uploading...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="size-8 opacity-40" />
                  <span className="text-sm">Drop an image or click to upload</span>
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
          </div>

          {/* Badge name */}
          <div className="space-y-2">
            <Label htmlFor="badge-name">Badge Name *</Label>
            <Input
              id="badge-name"
              placeholder="e.g. Early Adopter"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          {/* Identifier / d-tag */}
          <div className="space-y-2">
            <Label htmlFor="badge-identifier">Identifier (d-tag)</Label>
            <Input
              id="badge-identifier"
              placeholder="auto-generated-slug"
              value={identifierTouched ? identifier : effectiveIdentifier}
              onChange={(e) => handleIdentifierChange(e.target.value)}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              URL-safe identifier. Auto-generated from the name but can be customized.
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="badge-description">Description</Label>
            <Textarea
              id="badge-description"
              placeholder="What is this badge awarded for?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Create button */}
          <Button
            onClick={handleCreate}
            disabled={!name.trim() || !effectiveIdentifier.trim() || isCreating || isUploading}
            className="w-full gap-2"
            size="lg"
          >
            {isCreating ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Award className="size-4" />
                Create Badge
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
