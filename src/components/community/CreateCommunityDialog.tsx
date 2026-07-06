import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useToast } from '@/hooks/useToast';
import { COMMUNITY_KIND, communitySlug } from '@/lib/community';

interface CreateCommunityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Dialog to create a new NIP-72 community (kind 34550). */
export function CreateCommunityDialog({ open, onOpenChange }: CreateCommunityDialogProps) {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const slug = communitySlug(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!slug) {
      toast({ title: 'Please enter a valid community name', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      // d-tag collision check — don't silently overwrite an existing community.
      const existing = await nostr.query(
        [{ kinds: [COMMUNITY_KIND], authors: [user.pubkey], '#d': [slug], limit: 1 }],
        { signal: AbortSignal.timeout(5000) },
      );
      if (existing.length > 0) {
        toast({
          title: 'You already have a community with this name',
          description: 'Pick a different name.',
          variant: 'destructive',
        });
        return;
      }

      const tags: string[][] = [
        ['d', slug],
        ['name', name.trim()],
      ];
      if (description.trim()) tags.push(['description', description.trim()]);
      if (image.trim()) tags.push(['image', image.trim()]);
      // The owner moderates their own community.
      tags.push(['p', user.pubkey, '', 'moderator']);

      await publishEvent({
        kind: COMMUNITY_KIND,
        content: '',
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      queryClient.invalidateQueries({ queryKey: ['communities'] });
      toast({ title: 'Community created' });
      onOpenChange(false);
      setName('');
      setDescription('');
      setImage('');

      const naddr = nip19.naddrEncode({
        kind: COMMUNITY_KIND,
        pubkey: user.pubkey,
        identifier: slug,
      });
      navigate(`/${naddr}`);
    } catch {
      toast({ title: 'Failed to create community', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a community</DialogTitle>
          <DialogDescription>
            Start a moderated community (NIP-72). You'll be its owner and first moderator.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="community-name">Name</Label>
            <Input
              id="community-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nostr Memes"
              maxLength={64}
              required
            />
            {slug && (
              <p className="text-xs text-muted-foreground">Identifier: {slug}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-description">Description</Label>
            <Textarea
              id="community-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this community about?"
              rows={3}
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="community-image">Image URL (optional)</Label>
            <Input
              id="community-image"
              type="url"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !name.trim()}>
              {isSubmitting ? 'Creating…' : 'Create community'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
