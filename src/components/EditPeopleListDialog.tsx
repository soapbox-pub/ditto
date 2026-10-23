/**
 * EditPeopleListDialog
 *
 * Dialog for editing the details (title, description, cover image) of a
 * people list the current user owns — either a NIP-51 Follow Set (kind 30000)
 * or a Follow Pack (kind 39089). Mutations go through the read-modify-write
 * hooks (`useUserLists().updateList` / `useFollowPackActions().updatePack`),
 * so fresh relay state is fetched before republishing and `published_at` is
 * preserved.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Loader2, Upload } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { FormattedMessage, useIntl } from 'react-intl';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useFollowPackActions } from '@/hooks/useFollowPacks';
import { useToast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useUserLists } from '@/hooks/useUserLists';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

interface EditPeopleListDialogProps {
  /** The kind 30000 or 39089 event being edited (must be owned by the current user). */
  event: NostrEvent;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditPeopleListDialog({ event, open, onOpenChange }: EditPeopleListDialogProps) {
  const intl = useIntl();
  const { toast } = useToast();
  const { updateList } = useUserLists();
  const { updatePack } = useFollowPackActions();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isPack = event.kind === 39089;
  const listType = isPack ? 'pack' : 'list';
  const dTag = useMemo(
    () => event.tags.find(([n]) => n === 'd')?.[1] ?? '',
    [event.tags],
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [saving, setSaving] = useState(false);

  // Re-seed form fields from the event whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    const getTag = (name: string) => event.tags.find(([n]) => n === name)?.[1];
    setTitle(getTag('title') || getTag('name') || '');
    setDescription(getTag('description') || getTag('summary') || '');
    setImage(getTag('image') || getTag('thumb') || '');
  }, [open, event]);

  const previewUrl = useMemo(() => sanitizeUrl(image.trim() || undefined), [image]);

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const tags = await uploadFile(file);
      setImage(tags[0][1]);
    } catch {
      toast({ title: intl.formatMessage({ id: 'editPeopleList.uploadFailed', defaultMessage: 'Failed to upload image' }), variant: 'destructive' });
    }
  };

  const handleSave = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const details = {
        title: title.trim(),
        description: description.trim() || undefined,
        image: image.trim() || undefined,
      };
      if (isPack) {
        await updatePack.mutateAsync({ packId: dTag, ...details });
      } else {
        await updateList.mutateAsync({ listId: dTag, ...details });
      }
      toast({ title: intl.formatMessage({ id: 'editPeopleList.updated', defaultMessage: 'Updated "{title}"' }, { title: details.title }) });
      onOpenChange(false);
    } catch {
      toast({
        title: intl.formatMessage(
          { id: 'editPeopleList.updateFailed', defaultMessage: 'Failed to update {listType, select, pack {pack} other {list}}' },
          { listType },
        ),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>
            <FormattedMessage
              id="editPeopleList.title"
              defaultMessage="Edit {listType, select, pack {follow pack} other {list}}"
              values={{ listType }}
            />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="people-list-title"><FormattedMessage id="editPeopleList.titleLabel" defaultMessage="Title" /></Label>
            <Input
              id="people-list-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isPack
                ? intl.formatMessage({ id: 'editPeopleList.packTitlePlaceholder', defaultMessage: 'Pack title…' })
                : intl.formatMessage({ id: 'editPeopleList.listTitlePlaceholder', defaultMessage: 'List title…' })}
              maxLength={120}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="people-list-description"><FormattedMessage id="editPeopleList.descriptionLabel" defaultMessage="Description" /></Label>
            <Textarea
              id="people-list-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={intl.formatMessage(
                { id: 'editPeopleList.descriptionPlaceholder', defaultMessage: 'What is this {listType, select, pack {pack} other {list}} about?' },
                { listType },
              )}
              rows={3}
              maxLength={500}
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="people-list-image"><FormattedMessage id="editPeopleList.coverImage" defaultMessage="Cover image" /></Label>
            <div className="flex gap-2">
              <Input
                id="people-list-image"
                value={image}
                onChange={(e) => setImage(e.target.value)}
                placeholder="https://…"
                disabled={saving || isUploading}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving || isUploading}
                aria-label={intl.formatMessage({ id: 'editPeopleList.uploadCover', defaultMessage: 'Upload cover image' })}
                title={intl.formatMessage({ id: 'editPeopleList.uploadCover', defaultMessage: 'Upload cover image' })}
              >
                {isUploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Upload className="size-4" />
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handleUpload(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
            {previewUrl ? (
              <div className="rounded-lg overflow-hidden border border-border-subtle bg-muted">
                <img
                  src={previewUrl}
                  alt={intl.formatMessage({ id: 'editPeopleList.coverPreview', defaultMessage: 'Cover preview' })}
                  className="w-full h-32 object-cover"
                  onError={(e) => {
                    (e.currentTarget.parentElement as HTMLElement).style.display = 'none';
                  }}
                  decoding="async"
                />
              </div>
            ) : image.trim() ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ImageIcon className="size-3.5 shrink-0" />
                <FormattedMessage id="editPeopleList.invalidUrl" defaultMessage="Enter a valid https:// image URL." />
              </p>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || saving || isUploading}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            <FormattedMessage id="common.save" defaultMessage="Save" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
