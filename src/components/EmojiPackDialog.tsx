import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ImagePlus, Loader2, Smile, X } from 'lucide-react';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CustomEmojiImg } from '@/components/CustomEmoji';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { cn } from '@/lib/utils';

/** A single emoji entry in the pack being edited. */
interface Entry {
  /** Client-side key for React list rendering. */
  id: string;
  shortcode: string;
  /** Remote (Blossom) URL once uploaded. Empty while `uploading`. */
  url: string;
  /** True while the source image is still being uploaded. */
  uploading: boolean;
}

/**
 * Sanitize what someone is *typing* into a shortcode. Deliberately does not
 * trim leading/trailing underscores: doing that per-keystroke makes `foo_bar`
 * impossible to type (the `_` is eaten the moment it lands at the end).
 * Trimming happens once, in `finalShortcode()`, at validation/publish time.
 */
function sanitizeShortcode(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 32);
}

/** The shortcode as it will be published. */
function finalShortcode(raw: string): string {
  return raw.replace(/^_+|_+$/g, '');
}

/** Seed a shortcode from an uploaded file's name (extension dropped). */
function shortcodeFromFilename(name: string): string {
  return finalShortcode(sanitizeShortcode(name.replace(/\.[a-z0-9]+$/i, '')));
}

/** Convert a title into a URL-safe slug for the identifier. */
function slugify(title: string): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'pack';
}

let entryCounter = 0;
function nextEntryId(): string {
  return `entry-${++entryCounter}-${Date.now()}`;
}

/**
 * Gather image files from a drop event, descending into any dropped folders
 * (a Ditto convenience — drop a whole directory of emoji images at once).
 */
async function filesFromDrop(e: React.DragEvent): Promise<File[]> {
  const items = e.dataTransfer.items;
  if (!items || items.length === 0) {
    return Array.from(e.dataTransfer.files);
  }

  const entries: FileSystemEntry[] = [];
  const looseFiles: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
    } else {
      const file = items[i].getAsFile();
      if (file) looseFiles.push(file);
    }
  }

  if (entries.length === 0) return looseFiles;

  const readEntry = (entry: FileSystemEntry, out: File[]): Promise<void> =>
    new Promise((resolve) => {
      if (entry.isFile) {
        (entry as FileSystemFileEntry).file((file) => {
          out.push(file);
          resolve();
        }, () => resolve());
      } else if (entry.isDirectory) {
        const reader = (entry as FileSystemDirectoryEntry).createReader();
        reader.readEntries(async (children) => {
          await Promise.all(children.map((c) => readEntry(c, out)));
          resolve();
        }, () => resolve());
      } else {
        resolve();
      }
    });

  const collected: File[] = [...looseFiles];
  await Promise.all(entries.map((entry) => readEntry(entry, collected)));
  return collected;
}

interface EmojiPackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, the dialog opens in edit mode for an existing pack. */
  editEvent?: NostrEvent;
}

/**
 * Create or edit a NIP-30 emoji pack (kind 30030): name it, give it a cover
 * icon, upload emoji images, and give each a shortcode. Images upload the
 * moment they're added so publishing is instant. Only ever runs on an explicit
 * user action.
 */
export function EmojiPackDialog({ open, onOpenChange, editEvent }: EmojiPackDialogProps) {
  const isEditMode = !!editEvent;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Smile className="size-5 text-primary" />
            {isEditMode ? 'Edit Emoji Pack' : 'Create Emoji Pack'}
          </DialogTitle>
          <DialogDescription>
            Upload images, give each a shortcode, and publish a pack anyone can add.
          </DialogDescription>
        </DialogHeader>

        {/* Remount the form each time the dialog opens so its state resets. */}
        {open && (
          <EmojiPackForm editEvent={editEvent} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmojiPackForm({ editEvent, onDone }: { editEvent?: NostrEvent; onDone: () => void }) {
  const { user } = useCurrentUser();
  const { nostr } = useNostr();
  const { mutateAsync: publishEvent, isPending: publishing } = useNostrPublish();
  const { mutateAsync: uploadFile } = useUploadFile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const isEditMode = !!editEvent;

  // Parse initial values from editEvent.
  const initial = useMemo(() => {
    if (!editEvent) return null;
    const tag = (n: string) => editEvent.tags.find(([k]) => k === n)?.[1];
    const emojis: Entry[] = [];
    for (const t of editEvent.tags) {
      if (t[0] === 'emoji' && t[1] && t[2]) {
        emojis.push({ id: nextEntryId(), shortcode: t[1], url: t[2], uploading: false });
      }
    }
    return {
      identifier: tag('d') ?? '',
      name: tag('name') ?? tag('title') ?? '',
      about: tag('about') ?? '',
      icon: tag('image') ?? tag('picture') ?? '',
      emojis,
    };
  }, [editEvent]);

  const fileInput = useRef<HTMLInputElement>(null);
  const iconInput = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial?.name ?? '');
  const [about, setAbout] = useState(initial?.about ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '');
  const [iconUploading, setIconUploading] = useState(false);
  const [entries, setEntries] = useState<Entry[]>(initial?.emojis ?? []);
  const [dragging, setDragging] = useState(false);
  const [addToMine, setAddToMine] = useState(!isEditMode);
  // Spans the whole publish handler. `publishing` (the publishEvent mutation)
  // only covers the event write; the list read-modify-write afterward can run
  // for seconds with no other signal, leaving the button looking idle while
  // work is still in flight.
  const [submitting, setSubmitting] = useState(false);

  // The pack's cover image (`image`/`picture` tags). Other clients — Ditto's
  // own feed card among them — show this beside the name and fall back to
  // nothing without it, so a pack published with none looks bare.
  const addIcon = useCallback(async (file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    setIconUploading(true);
    try {
      const tags = await uploadFile(file);
      setIcon(tags[0]?.[1] ?? '');
    } catch {
      toast({ title: 'Icon upload failed', description: file.name, variant: 'destructive' });
    } finally {
      setIconUploading(false);
    }
  }, [uploadFile, toast]);

  const addFiles = useCallback(async (files: FileList | File[] | null) => {
    if (!files) return;
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) {
      toast({ title: 'No images', description: 'No image files found.', variant: 'destructive' });
      return;
    }
    await Promise.all(images.map(async (file) => {
      const id = nextEntryId();
      setEntries((prev) => [
        ...prev,
        { id, shortcode: shortcodeFromFilename(file.name), url: '', uploading: true },
      ]);
      try {
        const tags = await uploadFile(file);
        const url = tags[0]?.[1] ?? '';
        setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, url, uploading: false } : e)));
      } catch {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        toast({ title: 'Upload failed', description: file.name, variant: 'destructive' });
      }
    }));
  }, [uploadFile, toast]);

  const setShortcode = useCallback((id: string, value: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, shortcode: sanitizeShortcode(value) } : e)));
  }, []);

  const removeEntry = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void filesFromDrop(e).then(addFiles);
  }, [addFiles]);

  const uploading = entries.filter((e) => e.uploading).length;
  const uploaded = useMemo(() => entries.filter((e) => !e.uploading && e.url), [entries]);

  // Shortcodes must be present and unique — publishing a pack that silently
  // drops colliding entries leaves people with a pack missing emojis.
  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of uploaded) {
      const code = finalShortcode(e.shortcode);
      if (code) map.set(code, (map.get(code) ?? 0) + 1);
    }
    return map;
  }, [uploaded]);
  const isDuplicate = (raw: string) => (counts.get(finalShortcode(raw)) ?? 0) > 1;
  const duplicates = [...counts.values()].filter((n) => n > 1).length;
  const missing = uploaded.filter((e) => !finalShortcode(e.shortcode)).length;
  const named = name.trim().length > 0;
  const canPublish = named && uploaded.length > 0 && !uploading && !iconUploading &&
    !publishing && !submitting && duplicates === 0 && missing === 0;

  const busy = publishing || submitting;
  const hint = busy
    ? 'Publishing…'
    : uploading > 0 || iconUploading
      ? `Uploading ${uploading + (iconUploading ? 1 : 0)} image${uploading + (iconUploading ? 1 : 0) === 1 ? '' : 's'}…`
      : missing > 0
        ? 'Every emoji needs a shortcode.'
        : duplicates > 0
          ? 'Two emojis share a shortcode. Make each one unique.'
          : !named
            ? 'Give the pack a name.'
            : uploaded.length === 0
              ? 'Add at least one image.'
              : 'Anyone will be able to find and add this pack.';

  const publish = useCallback(async () => {
    if (!user || !canPublish) return;
    setSubmitting(true);

    // In edit mode the identifier is fixed. For a new pack, append a short
    // random suffix so two packs with the same name never overwrite each other
    // (addressable events are keyed by kind:pubkey:d).
    const identifier = isEditMode
      ? initial!.identifier
      : `${slugify(name)}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      // For edit mode, fetch the fresh event to preserve tags we don't manage.
      let preservedTags: string[][] = [];
      let prev: NostrEvent | null = null;
      if (isEditMode) {
        prev = await fetchFreshEvent(nostr, {
          kinds: [30030],
          authors: [user.pubkey],
          '#d': [identifier],
        });
        if (prev) {
          preservedTags = prev.tags.filter(
            ([n]) => !['d', 'name', 'title', 'about', 'image', 'picture', 'emoji'].includes(n),
          );
        }
      }

      // `title` and `name` both carry the human name: some clients read one or
      // the other, falling back to the raw `d` slug without it, so emit both.
      // `image` and `picture` both carry the cover so icon-reading clients
      // (either tag) resolve it.
      const tags: string[][] = [
        ['d', identifier],
        ['title', name.trim()],
        ['name', name.trim()],
      ];
      if (about.trim()) tags.push(['about', about.trim()]);
      if (icon) tags.push(['image', icon], ['picture', icon]);
      tags.push(...preservedTags);
      for (const e of uploaded) {
        tags.push(['emoji', finalShortcode(e.shortcode), e.url]);
      }

      await publishEvent({ kind: 30030, content: '', tags, prev: prev ?? undefined });

      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['custom-emojis'] });
      queryClient.invalidateQueries({ queryKey: ['emoji-list'] });

      // Your own pack in your own emoji list (kind 10030) — an explicit opt-in
      // on this click, never automatic. A failure here must not read as a
      // failed publish: the pack itself is already out.
      if (addToMine && !isEditMode) {
        try {
          await addPackToMyList(identifier);
          queryClient.invalidateQueries({ queryKey: ['emoji-list'] });
          queryClient.invalidateQueries({ queryKey: ['custom-emojis'] });
          toast({ title: 'Emoji pack published', description: `${name.trim()} — added to your emojis` });
        } catch {
          toast({
            title: 'Published, but not added to your emojis',
            description: "Couldn't update your emoji list.",
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: isEditMode ? 'Emoji pack updated' : 'Emoji pack published',
          description: name.trim(),
        });
      }

      onDone();
    } catch {
      toast({
        title: "Couldn't publish pack",
        description: 'Publishing failed. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }

    async function addPackToMyList(id: string) {
      const list = await fetchFreshEvent(nostr, { kinds: [10030], authors: [user!.pubkey] });
      const packRef = `30030:${user!.pubkey}:${id}`;
      const existing = list?.tags.filter(([n]) => n === 'emoji' || n === 'a') ?? [];
      if (existing.some(([n, v]) => n === 'a' && v === packRef)) return;
      await publishEvent({
        kind: 10030,
        content: list?.content ?? '',
        tags: [...existing, ['a', packRef]],
        prev: list ?? undefined,
      });
    }
  }, [user, canPublish, isEditMode, initial, name, about, icon, uploaded, addToMine, nostr, publishEvent, queryClient, toast, onDone]);

  if (!user) return null;

  return (
    <ScrollArea className="max-h-[70vh]">
      <div className="px-5 pb-5 space-y-5">
        {/* Hidden icon file input */}
        <input
          ref={iconInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void addIcon(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        {/* Pack icon + name */}
        <div className="flex items-end gap-3">
          <button
            type="button"
            onClick={() => iconInput.current?.click()}
            aria-label="Pack icon"
            disabled={busy}
            className={cn(
              'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border transition-colors',
              icon
                ? 'border-transparent'
                : 'border-dashed border-border text-muted-foreground hover:border-muted-foreground/60 hover:bg-foreground/5',
            )}
          >
            {iconUploading ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : icon ? (
              <img src={icon} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-5" />
            )}
          </button>
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="pack-name">Pack name</Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My emoji pack"
              maxLength={60}
              disabled={busy}
              autoFocus
            />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <Label htmlFor="pack-about">
            Description <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Textarea
            id="pack-about"
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder="What's in this pack?"
            maxLength={280}
            rows={2}
            disabled={busy}
            className="resize-none text-sm"
          />
        </div>

        {/* Hidden emoji file input */}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* Emojis */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Emojis</Label>
            {uploaded.length > 0 && (
              <span className="text-xs text-muted-foreground">{uploaded.length}</span>
            )}
            {entries.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 text-xs text-muted-foreground"
                onClick={() => fileInput.current?.click()}
                disabled={busy}
              >
                <ImagePlus className="size-3.5" />
                Add more
              </Button>
            )}
          </div>

          {entries.length === 0 ? (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center transition-colors',
                dragging
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border text-muted-foreground hover:border-muted-foreground/60 hover:bg-foreground/5',
              )}
            >
              <ImagePlus className="size-6" />
              <span className="text-sm font-medium text-foreground">Add emoji images</span>
              <span className="text-xs">Drop them here or a folder, or click to browse. PNG, GIF or WebP.</span>
            </button>
          ) : (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'max-h-56 space-y-1.5 overflow-y-auto rounded-xl p-1.5 transition-colors',
                dragging ? 'bg-primary/10' : 'bg-secondary/30',
              )}
            >
              {entries.map((e) => {
                const invalid = !e.uploading && (!finalShortcode(e.shortcode) || isDuplicate(e.shortcode));
                return (
                  <div key={e.id} className="flex items-center gap-2">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-background">
                      {e.uploading ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <CustomEmojiImg name={e.shortcode} url={e.url} className="size-7 object-contain" />
                      )}
                    </span>
                    <div
                      className={cn(
                        'flex min-w-0 flex-1 items-center rounded-md border bg-background px-2 focus-within:ring-1',
                        invalid
                          ? 'border-destructive focus-within:ring-destructive'
                          : 'border-input focus-within:ring-ring',
                      )}
                    >
                      <span className="text-sm text-muted-foreground">:</span>
                      <input
                        value={e.shortcode}
                        onChange={(ev) => setShortcode(e.id, ev.target.value)}
                        placeholder="shortcode"
                        aria-label="Emoji shortcode"
                        aria-invalid={invalid}
                        disabled={busy}
                        className="min-w-0 flex-1 bg-transparent py-1.5 text-sm font-mono outline-none"
                      />
                      <span className="text-sm text-muted-foreground">:</span>
                    </div>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeEntry(e.id)}
                      aria-label={`Remove ${e.shortcode || 'emoji'}`}
                      disabled={busy}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Publish */}
        <div className="space-y-2">
          {!isEditMode && (
            <Label className="flex cursor-pointer items-center gap-2 py-1 text-sm font-normal text-muted-foreground">
              <Checkbox
                checked={addToMine}
                onCheckedChange={(v) => setAddToMine(v === true)}
                className="shrink-0"
                disabled={busy}
              />
              Add to my emojis
            </Label>
          )}
          <Button className="w-full gap-2" onClick={publish} disabled={!canPublish}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {isEditMode ? 'Update pack' : 'Publish pack'}
          </Button>
          <p
            className={cn(
              'flex items-center justify-center gap-1.5 text-center text-xs',
              duplicates > 0 || missing > 0 ? 'text-destructive' : 'text-muted-foreground',
            )}
          >
            {(duplicates > 0 || missing > 0) && <AlertTriangle className="size-3.5 shrink-0" />}
            {hint}
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}
