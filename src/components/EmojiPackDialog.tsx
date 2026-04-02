import { useState, useCallback, useRef, useMemo } from 'react';
import { Smile, Upload, Loader2, X, GripVertical, FolderOpen } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  url: string;
  /** True while this entry's image is still uploading. */
  uploading?: boolean;
}

/** Convert a filename to a shortcode (alphanumeric, hyphens, underscores only). */
function filenameToShortcode(filename: string): string {
  // Remove extension
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  // Replace non-allowed characters with underscores, collapse runs, trim edges
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
  const { mutateAsync: publishEvent, isPending: isPublishing } = useNostrPublish();
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
    return { identifier, name, emojis };
  }, [editEvent]);

  // Form state
  const [identifier, setIdentifier] = useState(initialData?.identifier ?? '');
  const [name, setName] = useState(initialData?.name ?? '');
  const [idTouched, setIdTouched] = useState(isEditMode);
  const [emojis, setEmojis] = useState<EmojiEntry[]>(initialData?.emojis ?? []);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag state for reordering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const isUploading = uploadingCount > 0;

  const effectiveIdentifier = idTouched ? identifier : slugify(name);

  const resetForm = useCallback(() => {
    setIdentifier(initialData?.identifier ?? '');
    setName(initialData?.name ?? '');
    setIdTouched(isEditMode);
    setEmojis(initialData?.emojis ?? []);
    setIsDragOver(false);
    setUploadingCount(0);
    setDragIndex(null);
    setDragOverIndex(null);
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

  /** Upload a single file and add it to the emoji list. */
  const uploadAndAddEmoji = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const shortcode = filenameToShortcode(file.name);
    if (!shortcode) return;

    const entryId = nextEntryId();

    // Create a local preview immediately
    const previewUrl = URL.createObjectURL(file);
    const placeholderEntry: EmojiEntry = {
      id: entryId,
      shortcode,
      url: previewUrl,
      uploading: true,
    };

    setEmojis((prev) => [...prev, placeholderEntry]);
    setUploadingCount((c) => c + 1);

    try {
      const [[, url]] = await uploadFile(file);
      setEmojis((prev) =>
        prev.map((e) =>
          e.id === entryId ? { ...e, url, uploading: false } : e,
        ),
      );
    } catch {
      // Remove the failed entry
      setEmojis((prev) => prev.filter((e) => e.id !== entryId));
      toast({
        title: 'Upload failed',
        description: `Failed to upload ${file.name}`,
        variant: 'destructive',
      });
    } finally {
      URL.revokeObjectURL(previewUrl);
      setUploadingCount((c) => c - 1);
    }
  }, [uploadFile, toast]);

  /** Process multiple files from drop or file input. */
  const handleFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      toast({ title: 'No images', description: 'No image files found.', variant: 'destructive' });
      return;
    }
    // Upload all in parallel
    await Promise.allSettled(imageFiles.map(uploadAndAddEmoji));
  }, [uploadAndAddEmoji, toast]);

  /** Handle drop zone events. */
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const items = e.dataTransfer.items;
    const files: File[] = [];

    if (items) {
      // Check for directory entries via webkitGetAsEntry
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
        // Recursively read all files from directory entries
        const readAllEntries = async (entries: FileSystemEntry[]): Promise<File[]> => {
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
                dirReader.readEntries(async (dirEntries) => {
                  await Promise.all(dirEntries.map(readEntry));
                  resolve();
                }, () => resolve());
              } else {
                resolve();
              }
            });
          };

          await Promise.all(entries.map(readEntry));
          return allFiles;
        };

        readAllEntries(entries).then(handleFiles);
        return;
      }
    }

    // Fallback: use plain files list
    for (let i = 0; i < e.dataTransfer.files.length; i++) {
      files.push(e.dataTransfer.files[i]);
    }
    handleFiles(files);
  }, [handleFiles]);

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
    handleFiles(files);
    // Reset input so the same files can be re-selected
    e.target.value = '';
  }, [handleFiles]);

  /** Update a single emoji's shortcode. */
  const updateShortcode = useCallback((id: string, newShortcode: string) => {
    setEmojis((prev) =>
      prev.map((e) => (e.id === id ? { ...e, shortcode: newShortcode } : e)),
    );
  }, []);

  /** Remove an emoji entry. */
  const removeEmoji = useCallback((id: string) => {
    setEmojis((prev) => prev.filter((e) => e.id !== id));
  }, []);

  /** Row-level drag-and-drop reorder handlers. */
  const handleRowDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    // Set minimal drag data so the browser shows a drag ghost
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleRowDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleRowDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragIndex === null || dragIndex === toIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    setEmojis((prev) => {
      const updated = [...prev];
      const [moved] = updated.splice(dragIndex, 1);
      updated.splice(toIndex, 0, moved);
      return updated;
    });
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex]);

  const handleRowDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  /** Publish the emoji pack. */
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

    try {
      // For edit mode, fetch fresh event to preserve any tags we don't manage
      let preservedTags: string[][] = [];
      if (isEditMode) {
        const fresh = await fetchFreshEvent(nostr, {
          kinds: [30030],
          authors: [user.pubkey],
          '#d': [resolvedId],
        });
        if (fresh) {
          // Keep tags that aren't d, name, or emoji
          preservedTags = fresh.tags.filter(
            ([n]) => n !== 'd' && n !== 'name' && n !== 'emoji',
          );
        }
      }

      const tags: string[][] = [
        ['d', resolvedId],
        ...(name.trim() ? [['name', name.trim()]] : []),
        ...preservedTags,
        ...emojis.map((e) => ['emoji', e.shortcode, e.url]),
      ];

      await publishEvent({
        kind: 30030,
        content: '',
        tags,
      } as Omit<NostrEvent, 'id' | 'pubkey' | 'sig'>);

      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['custom-emojis'] });
      queryClient.invalidateQueries({ queryKey: ['emoji-list'] });

      toast({
        title: isEditMode ? 'Emoji pack updated!' : 'Emoji pack created!',
        description: `"${name.trim() || resolvedId}" with ${emojis.length} emoji${emojis.length !== 1 ? 's' : ''}.`,
      });

      handleOpenChange(false);
    } catch {
      toast({
        title: 'Failed to publish',
        description: 'Could not publish the emoji pack. Please try again.',
        variant: 'destructive',
      });
    }
  }, [user, effectiveIdentifier, name, emojis, isEditMode, nostr, publishEvent, queryClient, toast, handleOpenChange]);

  // Validation
  const hasValidEmojis = emojis.length > 0 && emojis.every((e) => !e.uploading && e.url && e.shortcode);
  const canPublish = effectiveIdentifier.trim() && hasValidEmojis && !isPublishing && !isUploading;

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
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="emoji-pack-identifier">ID *</Label>
                <Input
                  id="emoji-pack-identifier"
                  placeholder="e.g. blobcats"
                  value={idTouched ? identifier : effectiveIdentifier}
                  onChange={(e) => handleIdChange(e.target.value)}
                  disabled={isEditMode}
                  className={`font-mono text-sm ${isEditMode ? 'text-muted-foreground' : ''}`}
                />
                {isEditMode && (
                  <p className="text-xs text-muted-foreground">Cannot be changed.</p>
                )}
              </div>
            </div>

            {/* Drop zone for adding emojis */}
            <div className="space-y-1.5">
              <Label>Emojis</Label>
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                className={`relative flex flex-col items-center justify-center w-full border-2 border-dashed rounded-xl transition-colors cursor-pointer overflow-hidden ${
                  isDragOver
                    ? 'border-primary bg-primary/5'
                    : 'border-border bg-secondary/5 hover:bg-secondary/10'
                } ${emojis.length > 0 ? 'h-20' : 'h-28'}`}
              >
                {isUploading ? (
                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    <span className="text-xs">Uploading {uploadingCount} file{uploadingCount !== 1 ? 's' : ''}...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Upload className="size-4 opacity-50" />
                      <FolderOpen className="size-4 opacity-50" />
                    </div>
                    <span className="text-xs text-center px-4">
                      Drop images or a folder here, or click to browse
                    </span>
                  </div>
                )}
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
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {emojis.length} emoji{emojis.length !== 1 ? 's' : ''}
                  </span>
                  {emojis.length > 1 && (
                    <span className="text-[10px] text-muted-foreground/60">
                      Drag to reorder
                    </span>
                  )}
                </div>
                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {emojis.map((emoji, index) => (
                    <div
                      key={emoji.id}
                      draggable
                      onDragStart={(e) => handleRowDragStart(e, index)}
                      onDragOver={(e) => handleRowDragOver(e, index)}
                      onDrop={(e) => handleRowDrop(e, index)}
                      onDragEnd={handleRowDragEnd}
                      className={`flex items-center gap-2 px-2 py-1.5 bg-background transition-colors ${
                        dragIndex === index ? 'opacity-40' : ''
                      } ${dragOverIndex === index && dragIndex !== null && dragIndex !== index ? 'bg-primary/5' : ''}`}
                    >
                      <div className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0">
                        <GripVertical className="size-3.5" />
                      </div>
                      <div className="size-8 shrink-0 rounded-md overflow-hidden bg-secondary/30 flex items-center justify-center">
                        {emoji.uploading ? (
                          <Loader2 className="size-4 animate-spin text-muted-foreground" />
                        ) : (
                          <img
                            src={emoji.url}
                            alt={`:${emoji.shortcode}:`}
                            className="size-8 object-contain"
                            loading="lazy"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="text-muted-foreground text-xs select-none">:</span>
                          <Input
                            value={emoji.shortcode}
                            onChange={(e) => updateShortcode(emoji.id, e.target.value)}
                            className="h-7 text-xs font-mono px-1 border-none shadow-none focus-visible:ring-1"
                            placeholder="shortcode"
                          />
                          <span className="text-muted-foreground text-xs select-none">:</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeEmoji(emoji.id)}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Publish button */}
            <Button
              onClick={handlePublish}
              disabled={!canPublish}
              className="w-full gap-2"
            >
              {isPublishing ? (
                <><Loader2 className="size-4 animate-spin" /> Publishing...</>
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
