import { useState, useCallback, useRef, useMemo } from 'react';
import { Smile, Upload, Loader2, X } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';
import { useNostr } from '@nostrify/react';
import { useQueryClient } from '@tanstack/react-query';

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
import { CustomEmojiImg } from '@/components/CustomEmoji';
import { SortableList, SortableItem } from '@/components/SortableList';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';

/** A single emoji entry in the pack being edited. */
interface EmojiEntry {
  /** Client-side key for React list rendering. */
  id: string;
  shortcode: string;
  /** Display URL -- either a remote Blossom URL (for already-uploaded emojis) or a local blob URL (for pending files). */
  url: string;
  /** When set, this file still needs to be uploaded on submit. */
  file?: File;
}

/** Convert a filename to a shortcode (alphanumeric, hyphens, underscores only). */
function filenameToShortcode(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  return base
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

/** Validate a shortcode against NIP-30 rules: alphanumeric, hyphens, underscores. */
function isValidShortcode(s: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

/** Convert a title into a URL-safe slug for the identifier. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

let entryCounter = 0;
function nextEntryId(): string {
  return `entry-${++entryCounter}-${Date.now()}`;
}

interface EmojiPackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog opens in edit mode for an existing pack. */
  editEvent?: NostrEvent;
}

export function EmojiPackDialog({ open, onOpenChange, editEvent }: EmojiPackDialogProps) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isEditMode = !!editEvent;

  // Parse initial values from editEvent
  const initialData = useMemo(() => {
    if (!editEvent) return null;
    const identifier = editEvent.tags.find(([n]) => n === 'd')?.[1] ?? '';
    const name = editEvent.tags.find(([n]) => n === 'name')?.[1] ?? '';
    const emojis: EmojiEntry[] = [];
    for (const tag of editEvent.tags) {
      if (tag[0] === 'emoji' && tag[1] && tag[2]) {
        emojis.push({ id: nextEntryId(), shortcode: tag[1], url: tag[2] });
      }
    }
    const about = editEvent.tags.find(([n]) => n === 'about')?.[1] ?? '';
    return { identifier, name, about, emojis };
  }, [editEvent]);

  // Form state
  const [identifier, setIdentifier] = useState(initialData?.identifier ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [about, setAbout] = useState(initialData?.about ?? '');
  const [idTouched, setIdTouched] = useState(isEditMode);
  const [emojis, setEmojis] = useState<EmojiEntry[]>(initialData?.emojis ?? []);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const effectiveIdentifier = idTouched ? identifier : slugify(name);

  const resetForm = useCallback(() => {
    setIdentifier(initialData?.identifier ?? '');
    setName(initialData?.name ?? '');
    setAbout(initialData?.about ?? '');
    setIdTouched(isEditMode);
    setEmojis((prev) => {
      for (const e of prev) {
        if (e.file) URL.revokeObjectURL(e.url);
      }
      return initialData?.emojis ?? [];
    });
    setIsDragOver(false);
    setIsSubmitting(false);
  }, [initialData, isEditMode]);

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    if (!idTouched) {
      setIdentifier(slugify(value));
    }
  }, [idTouched]);

  const handleIdChange = useCallback((value: string) => {
    setIdTouched(true);
    setIdentifier(value);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) resetForm();
    onOpenChange(nextOpen);
  }, [onOpenChange, resetForm]);

  /** Add image files to the emoji list as local previews (no upload yet). */
  const addFiles = useCallback((files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast({ title: 'No images', description: 'No image files found.', variant: 'destructive' });
      return;
    }

    const newEntries: EmojiEntry[] = imageFiles.map((file) => ({
      id: nextEntryId(),
      shortcode: filenameToShortcode(file.name),
      url: URL.createObjectURL(file),
      file,
    }));

    setEmojis((prev) => [...prev, ...newEntries]);
  }, [toast]);

  /** Handle drop zone events. */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    const files: File[] = [];

    if (items) {
      const entries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) {
          entries.push(entry);
        } else {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }

      if (entries.length > 0) {
        const readAllEntries = async (dirEntries: FileSystemEntry[]): Promise<File[]> => {
          const allFiles: File[] = [];

          const readEntry = (entry: FileSystemEntry): Promise<void> => {
            return new Promise((resolve) => {
              if (entry.isFile) {
                (entry as FileSystemFileEntry).file((file) => {
                  allFiles.push(file);
                  resolve();
                }, () => resolve());
              } else if (entry.isDirectory) {
                const dirReader = (entry as FileSystemDirectoryEntry).createReader();
                dirReader.readEntries(async (childEntries) => {
                  await Promise.all(childEntries.map(readEntry));
                  resolve();
                }, () => resolve());
              } else {
                resolve();
              }
            });
          };

          await Promise.all(dirEntries.map(readEntry));
          return allFiles;
        };

        readAllEntries(entries).then(addFiles);
        return;
      }
    }

    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      files.push(e.dataTransfer.files[i]);
    }
    addFiles(files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  /** File input handler. */
  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList) return;
    const files: File[] = [];
    for (let i = 0; i < fileList.length; i++) {
      files.push(fileList[i]);
    }
    addFiles(files);
    e.target.value = '';
  }, [addFiles]);

  /** Update a single emoji's shortcode. */
  const updateShortcode = useCallback((id: string, newShortcode: string) => {
    setEmojis((prev) =>
      prev.map((e) => (e.id === id ? { ...e, shortcode: newShortcode } : e)),
    );
  }, []);

  /** Remove an emoji entry. */
  const removeEmoji = useCallback((id: string) => {
    setEmojis((prev) => {
      const removed = prev.find((e) => e.id === id);
      if (removed?.file) URL.revokeObjectURL(removed.url);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  /** Reorder emojis after a drag completes (from SortableList). */
  const handleReorder = useCallback((reordered: EmojiEntry[]) => {
    setEmojis(reordered);
  }, []);

  /** Upload all pending files, then publish the emoji pack event. */
  const handlePublish = useCallback(async () => {
    const resolvedId = effectiveIdentifier.trim();
    if (!user || !resolvedId || emojis.length === 0) return;

    // Validate all shortcodes
    const invalid = emojis.find((e) => !isValidShortcode(e.shortcode));
    if (invalid) {
      toast({
        title: 'Invalid shortcode',
        description: `"${invalid.shortcode}" contains invalid characters. Use only letters, numbers, hyphens, and underscores.`,
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate shortcodes
    const seen = new Set<string>();
    for (const e of emojis) {
      if (seen.has(e.shortcode)) {
        toast({
          title: 'Duplicate shortcode',
          description: `"${e.shortcode}" appears more than once. Each shortcode must be unique.`,
          variant: 'destructive',
        });
        return;
      }
      seen.add(e.shortcode);
    }

    setIsSubmitting(true);

    try {
      // Upload all pending files in parallel
      const pendingEntries = emojis.filter((e) => e.file);
      const uploadResults = new Map<string, string>();

      if (pendingEntries.length > 0) {
        const results = await Promise.allSettled(
          pendingEntries.map(async (entry) => {
            const [[, url]] = await uploadFile(entry.file!);
            return { id: entry.id, url };
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled') {
            uploadResults.set(result.value.id, result.value.url);
          }
        }

        const failedCount = pendingEntries.length - uploadResults.size;
        if (failedCount > 0) {
          toast({
            title: 'Some uploads failed',
            description: `${failedCount} file${failedCount !== 1 ? 's' : ''} failed to upload. Please try again.`,
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Build the final emoji list with resolved URLs
      const resolvedEmojis = emojis.map((e) => ({
        shortcode: e.shortcode,
        url: uploadResults.get(e.id) ?? e.url,
      }));

      // For edit mode, fetch fresh event to preserve any tags we don't manage
      let preservedTags: string[][] = [];
      if (isEditMode) {
        const fresh = await fetchFreshEvent(nostr, {
          kinds: [30030],
          authors: [user.pubkey],
          '#d': [resolvedId],
        });
        if (fresh) {
          preservedTags = fresh.tags.filter(
            ([n]) => n !== 'd' && n !== 'name' && n !== 'about' && n !== 'emoji',
          );
        }
      }

      const tags: string[][] = [
        ['d', resolvedId],
        ...(name.trim() ? [['name', name.trim()]] : []),
        ...(about.trim() ? [['about', about.trim()]] : []),
        ...preservedTags,
        ...resolvedEmojis.map((e) => ['emoji', e.shortcode, e.url]),
      ];

      await publishEvent({
        kind: 30030,
        content: '',
        tags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      // Clean up blob URLs
      for (const e of emojis) {
        if (e.file) URL.revokeObjectURL(e.url);
      }

      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['custom-emojis'] });
      queryClient.invalidateQueries({ queryKey: ['emoji-list'] });

      toast({
        title: isEditMode ? 'Emoji pack updated!' : 'Emoji pack created!',
        description: `"${name.trim() || resolvedId}" with ${resolvedEmojis.length} emoji${resolvedEmojis.length !== 1 ? 's' : ''}.`,
      });

      handleOpenChange(false);
    } catch {
      toast({
        title: 'Failed to publish',
        description: 'Could not publish the emoji pack. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [user, effectiveIdentifier, name, about, emojis, isEditMode, nostr, publishEvent, uploadFile, queryClient, toast, handleOpenChange]);

  // Validation
  const pendingCount = emojis.filter((e) => e.file).length;
  const hasValidEmojis = emojis.length > 0 && emojis.every((e) => e.shortcode);
  const canPublish = effectiveIdentifier.trim() && hasValidEmojis && !isSubmitting;

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Smile className="size-5 text-primary" />
            {isEditMode ? 'Edit Emoji Pack' : 'Create Emoji Pack'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode
              ? 'Update your custom emoji set. Drag and drop images to add more emojis.'
              : 'Create a custom emoji set. Drag and drop images or a folder to populate it.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh]">
          <div className="px-5 pb-5 space-y-4">
            {/* Title & ID side-by-side */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="emoji-pack-name">Title</Label>
                <Input
                  id="emoji-pack-name"
                  placeholder="e.g. Blobcats"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emoji-pack-identifier">ID *</Label>
                <Input
                  id="emoji-pack-identifier"
                  placeholder="e.g. blobcats"
                  value={idTouched ? identifier : effectiveIdentifier}
                  onChange={(e) => handleIdChange(e.target.value)}
                  disabled={isEditMode || isSubmitting}
                  className={`font-mono text-sm ${isEditMode ? 'text-muted-foreground' : ''}`}
                />
                {isEditMode && (
                  <p className="text-xs text-muted-foreground">Cannot be changed.</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="emoji-pack-about">Description</Label>
              <Textarea
                id="emoji-pack-about"
                placeholder="What's in this emoji pack?"
                value={about}
                onChange={(e) => setAbout(e.target.value)}
                disabled={isSubmitting}
                className="min-h-[60px] resize-none text-sm"
                rows={2}
              />
            </div>

            {/* Drop zone for adding emojis */}
            <div className="space-y-1.5">
              <Label>Emojis</Label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => !isSubmitting && fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onKeyDown={(e) => { if (!isSubmitting && (e.key === 'Enter' || e.key === ' ')) fileInputRef.current?.click(); }}
                className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl transition-colors cursor-pointer overflow-hidden ${
                  isDragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-secondary/5 hover:bg-secondary/10'
                } ${emojis.length > 0 ? 'h-20' : 'h-28'} ${isSubmitting ? 'pointer-events-none opacity-50' : ''}`}
              >
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <Upload className="size-4 opacity-50" />
                  <span className="text-xs text-center px-4">
                    Drop images or a folder here, or click to browse
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileInputChange}
                />
              </div>
            </div>

            {/* Emoji list */}
            {emojis.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs text-muted-foreground">
                  {emojis.length} emoji{emojis.length !== 1 ? 's' : ''}
                </span>
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  <SortableList
                    items={emojis}
                    getItemId={(emoji) => emoji.id}
                    onReorder={handleReorder}
                    renderItem={(emoji) => (
                      <SortableItem
                        key={emoji.id}
                        id={emoji.id}
                        enabled={!isSubmitting}
                        className="items-center bg-background"
                        draggingClassName="z-10 opacity-80 shadow-lg ring-2 ring-primary/20"
                        gripClassName="w-7"
                      >
                        <div className="flex items-center gap-2 pr-2 py-1.5">
                          <div className="size-8 shrink-0 rounded-md overflow-hidden bg-secondary/30 flex items-center justify-center">
                            <CustomEmojiImg
                              name={emoji.shortcode}
                              url={emoji.url}
                              className="size-8 object-contain"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <Input
                              value={emoji.shortcode}
                              onChange={(e) => updateShortcode(emoji.id, e.target.value)}
                              className="h-7 text-xs font-mono px-1.5 border-none shadow-none focus-visible:ring-1"
                              placeholder="shortcode"
                              disabled={isSubmitting}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeEmoji(emoji.id)}
                            disabled={isSubmitting}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </SortableItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* Publish button */}
            <Button
              onClick={handlePublish}
              disabled={!canPublish}
              className="w-full gap-2"
            >
              {isSubmitting ? (
                <><Loader2 className="size-4 animate-spin" /> {pendingCount > 0 ? `Uploading ${pendingCount} file${pendingCount !== 1 ? 's' : ''}...` : 'Publishing...'}</>
              ) : (
                <><Smile className="size-4" /> {isEditMode ? 'Update Emoji Pack' : 'Create Emoji Pack'}</>
              )}
            </Button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
