import { useState, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useNostr } from '@nostrify/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import {
  ArrowLeft, Award, Pencil, Trash2, Loader2, Upload, Users, ExternalLink, X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { BadgeThumbnail } from '@/components/BadgeThumbnail';
import { AwardBadgeDialog } from '@/components/AwardBadgeDialog';
import { LoginArea } from '@/components/auth/LoginArea';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { parseBadgeDefinition, type BadgeData } from '@/components/BadgeContent';
import { BADGE_DEFINITION_KIND, getBadgeATag } from '@/lib/badgeUtils';
import { cn } from '@/lib/utils';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface ParsedBadge {
  event: NostrEvent;
  badge: BadgeData;
  aTag: string;
}

// ─── Edit Dialog ───────────────────────────────────────────────────────────────

function EditBadgeForm({ badge, onClose }: { badge: ParsedBadge; onClose: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(badge.badge.name);
  const [description, setDescription] = useState(badge.badge.description ?? '');
  const [imageUrl, setImageUrl] = useState(badge.badge.image ?? '');
  const [imagePreview, setImagePreview] = useState(badge.badge.image ?? '');
  const [isSaving, setIsSaving] = useState(false);

  const identifier = badge.badge.identifier;

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
    } catch {
      toast({ title: 'Upload failed', variant: 'destructive' });
    }
  }, [uploadFile, toast]);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      // Rebuild the tags from the original event, updating name/description/image
      const newTags: string[][] = [];
      // Always include d tag first
      newTags.push(['d', identifier]);
      newTags.push(['name', name.trim()]);
      if (description.trim()) {
        newTags.push(['description', description.trim()]);
      }
      if (imageUrl) {
        newTags.push(['image', imageUrl]);
      }
      // Carry forward any other tags (t, tier, price, supply, etc.)
      for (const tag of badge.event.tags) {
        const tagName = tag[0];
        if (['d', 'name', 'description', 'image', 'thumb'].includes(tagName)) continue;
        newTags.push(tag);
      }

      await publishEvent({
        kind: BADGE_DEFINITION_KIND,
        content: '',
        tags: newTags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      queryClient.invalidateQueries({ queryKey: ['my-created-badges'] });
      toast({ title: 'Badge updated!' });
      onClose();
    } catch {
      toast({ title: 'Failed to update badge', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }, [name, description, imageUrl, identifier, badge.event.tags, publishEvent, queryClient, toast, onClose]);

  return (
    <div className="space-y-4">
      {/* Image */}
      <div>
        <Label className="text-sm font-medium mb-1.5 block">Image</Label>
        <div
          className="relative w-24 h-24 rounded-xl overflow-hidden border border-border cursor-pointer group"
          onClick={() => fileInputRef.current?.click()}
        >
          {imagePreview ? (
            <img src={imagePreview} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-secondary/20">
              <Upload className="size-5 text-muted-foreground" />
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Pencil className="size-4 text-white" />
          </div>
          {isUploading && (
            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
              <Loader2 className="size-5 animate-spin" />
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
        />
      </div>

      {/* Name */}
      <div>
        <Label htmlFor="edit-name" className="text-sm font-medium mb-1.5 block">Name</Label>
        <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>

      {/* Identifier (read-only) */}
      <div>
        <Label className="text-sm font-medium mb-1.5 block">Identifier</Label>
        <Input value={identifier} disabled className="text-muted-foreground" />
      </div>

      {/* Description */}
      <div>
        <Label htmlFor="edit-desc" className="text-sm font-medium mb-1.5 block">Description</Label>
        <Textarea id="edit-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} disabled={isSaving || !name.trim()}>
          {isSaving ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
          Save Changes
        </Button>
      </div>
    </div>
  );
}

// ─── Badge Row ─────────────────────────────────────────────────────────────────

function CreatedBadgeRow({ badge, onEdit }: {
  badge: ParsedBadge;
  onEdit: (badge: ParsedBadge) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const [awardOpen, setAwardOpen] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await publishEvent({
        kind: 5,
        content: '',
        tags: [
          ['a', `${BADGE_DEFINITION_KIND}:${badge.event.pubkey}:${badge.badge.identifier}`],
          ['k', BADGE_DEFINITION_KIND.toString()],
        ],
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-created-badges'] });
      toast({ title: 'Deletion requested', description: 'The badge has been requested for deletion.' });
    },
    onError: () => {
      toast({ title: 'Failed to delete', variant: 'destructive' });
    },
  });

  const naddr = nip19.naddrEncode({
    kind: BADGE_DEFINITION_KIND,
    pubkey: badge.event.pubkey,
    identifier: badge.badge.identifier,
  });

  return (
    <>
      <Card className="group transition-colors hover:border-primary/20">
        <CardContent className="flex items-center gap-4 p-4">
          {/* Thumbnail */}
          <BadgeThumbnail badge={badge.badge} size={48} />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{badge.badge.name}</p>
            {badge.badge.description && (
              <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{badge.badge.description}</p>
            )}
            <p className="text-[10px] text-muted-foreground/60 font-mono mt-1">{badge.badge.identifier}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="View" asChild>
              <Link to={`/${naddr}`}>
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Award" onClick={() => setAwardOpen(true)}>
              <Users className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => onEdit(badge)}>
              <Pencil className="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Delete">
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete "{badge.badge.name}"?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This publishes a deletion request (NIP-09). Relays should remove the badge definition, but existing awards already issued will remain.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate()}
                    disabled={deleteMutation.isPending}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {deleteMutation.isPending ? <Loader2 className="size-4 animate-spin mr-1.5" /> : null}
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <AwardBadgeDialog
        open={awardOpen}
        onOpenChange={setAwardOpen}
        badgeATag={badge.aTag}
        badgeName={badge.badge.name}
      />
    </>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function BadgeCreatedPage() {
  const { config } = useAppContext();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const [editingBadge, setEditingBadge] = useState<ParsedBadge | null>(null);

  useSeoMeta({
    title: `Created Badges | ${config.appName}`,
    description: 'Manage badge definitions you have published',
  });

  const { data: rawEvents, isLoading } = useQuery({
    queryKey: ['my-created-badges', user?.pubkey ?? ''],
    queryFn: async ({ signal }) => {
      if (!user) return [];
      return nostr.query(
        [{ kinds: [BADGE_DEFINITION_KIND], authors: [user.pubkey], limit: 200 }],
        { signal },
      );
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const badges = useMemo(() => {
    if (!rawEvents) return [];
    const parsed: ParsedBadge[] = [];
    for (const event of rawEvents) {
      const badge = parseBadgeDefinition(event);
      if (!badge) continue;
      parsed.push({ event, badge, aTag: getBadgeATag(event) });
    }
    return parsed.sort((a, b) => b.event.created_at - a.event.created_at);
  }, [rawEvents]);

  return (
    <main className="pb-16 sidebar:pb-0">
      {/* Header */}
      <div className={cn('sidebar:sticky sidebar:top-0', 'flex items-center gap-4 px-4 pt-4 pb-5 bg-background/80 backdrop-blur-md z-10')}>
        <Link to="/badges" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Award className="size-5" />
          <h1 className="text-xl font-bold">Created Badges</h1>
        </div>
        <Button size="sm" className="gap-1.5" asChild>
          <Link to="/badges/create">
            <Award className="size-3.5" />
            New Badge
          </Link>
        </Button>
      </div>

      {!user ? (
        <div className="px-4 pt-8">
          <Card className="border-dashed border-primary/20 bg-primary/[0.02]">
            <CardContent className="flex flex-col items-center gap-3 py-8 px-6 text-center">
              <p className="text-sm text-muted-foreground">Log in to manage your created badges</p>
              <LoginArea className="max-w-60" />
            </CardContent>
          </Card>
        </div>
      ) : isLoading ? (
        <div className="px-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex items-center gap-4 p-4">
                <Skeleton className="size-12 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <div className="flex gap-1">
                  <Skeleton className="size-8 rounded" />
                  <Skeleton className="size-8 rounded" />
                  <Skeleton className="size-8 rounded" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : editingBadge ? (
        <div className="px-4 max-w-lg">
          <div className="flex items-center gap-3 mb-4">
            <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => setEditingBadge(null)}>
              <X className="size-4" />
              Cancel
            </Button>
            <h2 className="text-sm font-semibold text-muted-foreground">Editing: {editingBadge.badge.name}</h2>
          </div>
          <EditBadgeForm badge={editingBadge} onClose={() => setEditingBadge(null)} />
        </div>
      ) : badges.length === 0 ? (
        <div className="px-4 pt-8">
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <div className="max-w-sm mx-auto space-y-4">
                <Award className="size-8 text-muted-foreground/40 mx-auto" />
                <p className="text-muted-foreground">You haven't created any badges yet.</p>
                <Button asChild>
                  <Link to="/badges/create">Create Your First Badge</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          <p className="text-sm text-muted-foreground">{badges.length} badge{badges.length !== 1 ? 's' : ''} created</p>
          {badges.map((badge) => (
            <CreatedBadgeRow
              key={badge.aTag}
              badge={badge}
              onEdit={setEditingBadge}
            />
          ))}
        </div>
      )}
    </main>
  );
}
