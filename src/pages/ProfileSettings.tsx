import { useSeoMeta } from '@unhead/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2, ChevronDown, GripVertical, Type, Wallet, Image, Upload } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { ProfileCard } from '@/components/ProfileCard';
import { IntroImage } from '@/components/IntroImage';
import { HelpTip } from '@/components/HelpTip';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { AvatarShapePicker } from '@/components/AvatarShapePicker';
import { type AvatarShape, AVATAR_SHAPES, isValidAvatarShape } from '@/lib/avatarShape';

const WALLET_TICKERS = [
  '$BTC', '$ETH', '$SOL', '$XMR', '$LTC', '$DOGE', '$ADA', '$DOT', '$XRP', '$MATIC',
] as const;

/** Bare tickers used only for detection (strips leading $). */
const BARE_TICKERS = WALLET_TICKERS.map((t) => t.slice(1));

/** Infer the field type from stored label/value when loading from existing data. */
function inferFieldType(label: string, value: string): 'text' | 'wallet' | 'media' {
  const bare = label.replace(/^\$/, '').toUpperCase();
  if (BARE_TICKERS.includes(bare)) return 'wallet';
  // Known media file extensions
  if (/^https?:\/\/.+\.(jpe?g|png|gif|webp|svg|avif|mp4|webm|mov|mp3|ogg|wav|flac)(\?.*)?$/i.test(value)) return 'media';
  // Blossom-style URLs: path is a long hex hash (SHA-256), optionally with an extension
  if (/^https?:\/\/.+\/[0-9a-f]{64}(\.\w+)?$/i.test(value)) return 'media';
  return 'text';
}

const formSchema = n.metadata().extend({
  fields: z.array(z.object({
    label: z.string(),
    value: z.string(),
    type: z.enum(['text', 'wallet', 'media']),
  })).optional(),
  shape: z.enum(AVATAR_SHAPES).optional(),
});

type FormValues = z.infer<typeof formSchema>;

type CropState = {
  imageSrc: string;
  aspect: number;
  field: 'picture' | 'banner';
  title: string;
};

// ── Sortable field row ─────────────────────────────────────────────────────

interface SortableFieldRowProps {
  id: string;
  index: number;
  type: 'text' | 'wallet' | 'media';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  onRemove: () => void;
  onMediaPick: () => void;
  onTickerChange: (ticker: string) => void;
}

function SortableFieldRow({ id, index, type, control, onRemove, onMediaPick, onTickerChange }: SortableFieldRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`grid grid-cols-[auto,1fr,2fr,auto] gap-2 items-start ${isDragging ? 'z-10 opacity-80' : ''}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="flex items-center justify-center h-9 w-6 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {/* Label column — varies by type */}
      {type === 'wallet' ? (
        <FormField
          control={control}
          name={`fields.${index}.label`}
          render={({ field }) => (
            <FormItem>
              <Select value={field.value} onValueChange={(v) => { field.onChange(v); onTickerChange(v); }}>
                <FormControl>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Ticker" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {WALLET_TICKERS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={control}
          name={`fields.${index}.label`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input placeholder="Label" {...field} className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Value column — media gets upload button, others get text input */}
      {type === 'media' ? (
        <FormField
          control={control}
          name={`fields.${index}.value`}
          render={({ field }) => (
            <FormItem>
              <div className="flex gap-1.5">
                <FormControl>
                  <Input placeholder="URL" {...field} className="h-9 flex-1 min-w-0" readOnly={false} />
                </FormControl>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={onMediaPick}
                >
                  <Upload className="size-4" />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <FormField
          control={control}
          name={`fields.${index}.value`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input placeholder={type === 'wallet' ? 'Address' : 'Value or URL'} {...field} className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Delete button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="h-9 w-9 text-destructive hover:text-destructive"
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileSettings() {
  const { user, metadata, event } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useSeoMeta({
    title: `Profile | Settings | ${config.appName}`,
    description: `Edit your ${config.appName} profile`,
  });

  // Parse existing custom fields from raw event
  const parseFields = (): Array<{ label: string; value: string; type: 'text' | 'wallet' | 'media' }> => {
    if (!event) return [];
    try {
      const parsed = JSON.parse(event.content);
      if (Array.isArray(parsed.fields)) {
        return parsed.fields
          .filter((f: unknown) => Array.isArray(f) && f.length >= 2)
          .map((f: string[]) => {
            const type = inferFieldType(f[0], f[1]);
            // Ensure wallet labels carry the $ prefix so the Select value matches (e.g. "BTC" → "$BTC")
            const label = type === 'wallet' && !f[0].startsWith('$')
              ? `$${f[0].toUpperCase()}`
              : f[0];
            return { label, value: f[1], type };
          });
      }
    } catch { /* ignore */ }
    return [];
  };

  const parseShape = (): AvatarShape => {
    if (!event) return 'circle';
    try {
      const parsed = JSON.parse(event.content);
      if (isValidAvatarShape(parsed.shape)) return parsed.shape;
    } catch { /* ignore */ }
    return 'circle';
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', about: '', picture: '', banner: '',
      website: '', nip05: '', lud16: '', bot: false, fields: [],
      shape: 'circle' as AvatarShape,
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fields, append, remove, move } = useFieldArray({ control: form.control as any, name: 'fields' });

  // Drag-and-drop for custom fields
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );
  const handleFieldDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = fields.findIndex((f) => f.id === active.id);
    const newIndex = fields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    move(oldIndex, newIndex);
  }, [fields, move]);

  // Media field upload
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaIndex = useRef<number>(-1);
  const handleMediaPick = (index: number) => {
    pendingMediaIndex.current = index;
    mediaInputRef.current?.click();
  };
  const handleMediaFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const index = pendingMediaIndex.current;
    if (index < 0) return;
    try {
      const [[, url]] = await uploadFile(file);
      form.setValue(`fields.${index}.value`, url, { shouldDirty: true });
      toast({ title: 'Uploaded', description: 'Media file uploaded' });
    } catch {
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  useEffect(() => {
    if (metadata) {
      form.reset({
        name: metadata.name ?? '',
        about: metadata.about ?? '',
        picture: metadata.picture ?? '',
        banner: metadata.banner ?? '',
        website: metadata.website ?? '',
        nip05: metadata.nip05 ?? '',
        lud16: metadata.lud16 ?? '',
        bot: metadata.bot ?? false,
        fields: parseFields(),
        shape: parseShape(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata, event]);

  // Live values for the card preview
  const watched = form.watch();
  const cardMetadata: Partial<NostrMetadata> & { shape?: AvatarShape } = {
    name: watched.name,
    about: watched.about,
    picture: watched.picture,
    banner: watched.banner,
    website: watched.website,
    nip05: watched.nip05,
    lud16: watched.lud16,
    bot: watched.bot,
    shape: watched.shape,
  };

  // Card onChange: patch individual fields
  const handleCardChange = (patch: Partial<NostrMetadata>) => {
    for (const [k, v] of Object.entries(patch)) {
      form.setValue(k as keyof FormValues, v as string, { shouldDirty: true });
    }
  };

  // Image pick: open crop dialog
  const pickInputRef = useRef<HTMLInputElement>(null);
  const pendingField = useRef<'picture' | 'banner'>('picture');

  const handlePickImage = (field: 'picture' | 'banner') => {
    pendingField.current = field;
    pickInputRef.current?.click();
  };

  const handleFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const field = pendingField.current;
    setCropState({
      imageSrc: URL.createObjectURL(file),
      aspect: field === 'picture' ? 1 : 3,
      field,
      title: field === 'picture' ? 'Crop Profile Picture' : 'Crop Banner',
    });
  };

  const handleCropConfirm = async (blob: Blob) => {
    if (!cropState) return;
    const { field, imageSrc } = cropState;
    URL.revokeObjectURL(imageSrc);
    setCropState(null);
    try {
      const file = new File([blob], `${field}.jpg`, { type: 'image/jpeg' });
      const [[, url]] = await uploadFile(file);
      form.setValue(field, url, { shouldDirty: true });
      toast({ title: 'Uploaded', description: `${field === 'picture' ? 'Profile picture' : 'Banner'} updated` });
    } catch {
      toast({ title: 'Upload failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  const handleCropCancel = () => {
    if (cropState) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  };

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    try {
      const { fields: customFields, shape, ...standardMetadata } = values;
      const data: Record<string, unknown> = { ...metadata, ...standardMetadata };

      // Add shape only if non-default
      if (shape && shape !== 'circle') {
        data.shape = shape;
      } else {
        delete data.shape;
      }

      for (const key in data) {
        if (data[key] === '') delete data[key];
      }
      if (customFields && customFields.length > 0) {
        const nonEmpty = customFields.filter((f) => f.label.trim() && f.value.trim());
        if (nonEmpty.length > 0) data.fields = nonEmpty.map((f) => [f.label, f.value]);
      }
      await publishEvent({ kind: 0, content: JSON.stringify(data) });
      queryClient.invalidateQueries({ queryKey: ['logins'] });
      queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });
      toast({ title: 'Profile saved' });
    } catch {
      toast({ title: 'Error', description: 'Failed to save profile.', variant: 'destructive' });
    }
  };

  if (!user) return <Navigate to="/settings" replace />;

  const busy = isPending || isUploading;

  return (
    <main className="min-h-screen">
      {/* Hidden file input for avatar/banner */}
      <input
        ref={pickInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
      />
      {/* Hidden file input for media fields */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/*,video/*,audio/*"
        className="hidden"
        onChange={handleMediaFileChosen}
      />

      {/* Crop dialog */}
      {cropState && (
        <ImageCropDialog
          open
          imageSrc={cropState.imageSrc}
          aspect={cropState.aspect}
          title={cropState.title}
          onCancel={handleCropCancel}
          onCrop={handleCropConfirm}
        />
      )}

      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Profile</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Your Nostr identity is portable — it goes wherever you go. Edit your display name, bio, and avatar.</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl mx-auto px-4 pb-10 space-y-6">

          {/* Intro */}
          <div className="flex items-center gap-4 px-3 pt-2 pb-2">
            <IntroImage src="/profile-intro.png" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">Your Identity</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Tap any field on the card to edit. Click your avatar or banner to upload and crop a new image.
              </p>
            </div>
          </div>

          {/* Interactive profile card */}
          <ProfileCard
            pubkey={user.pubkey}
            metadata={cardMetadata}
            onChange={handleCardChange}
            onPickImage={handlePickImage}
          />

          {isUploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Uploading image…
            </div>
          )}

          {/* Avatar Shape */}
          <div>
            <h2 className="text-sm font-medium py-2">Avatar Shape</h2>
            <p className="text-xs text-muted-foreground mb-2">Choose how your avatar appears across the app</p>
            <AvatarShapePicker
              value={form.watch('shape') ?? 'circle'}
              onChange={(shape) => form.setValue('shape', shape, { shouldDirty: true })}
              pictureUrl={watched.picture || undefined}
              fallbackInitial={(watched.name?.[0] || '?').toUpperCase()}
            />
          </div>

          {/* Profile fields */}
          <div>
            <h2 className="text-sm font-medium py-2">Profile Fields</h2>
            <div className="space-y-3 pt-1">
              {/* Website — always first */}
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <div className="grid grid-cols-[auto,1fr,2fr,auto] gap-2 items-center">
                    <div className="w-6" />
                    <div className="flex items-center h-9 px-3 text-sm text-muted-foreground">
                      <span>Website</span>
                    </div>
                    <Input placeholder="https://yourwebsite.com" {...field} className="h-9" />
                    <div className="size-9" />
                  </div>
                )}
              />

              {/* Lightning address */}
              <FormField
                control={form.control}
                name="lud16"
                render={({ field }) => (
                  <div className="grid grid-cols-[auto,1fr,2fr,auto] gap-2 items-center">
                    <div className="w-6" />
                    <div className="flex items-center h-9 px-3 text-sm text-muted-foreground gap-1">
                      <span>Lightning</span>
                      <HelpTip faqId="what-are-zaps" iconSize="size-3.5" />
                    </div>
                    <Input placeholder="you@walletofsatoshi.com" {...field} className="h-9" />
                    <div className="size-9" />
                  </div>
                )}
              />

              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleFieldDragEnd}>
                <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                  {fields.map((field, index) => (
                    <SortableFieldRow
                      key={field.id}
                      id={field.id}
                      index={index}
                      type={form.watch(`fields.${index}.type`) ?? 'text'}
                      control={form.control}
                      onRemove={() => remove(index)}
                      onMediaPick={() => handleMediaPick(index)}
                      onTickerChange={(ticker) => form.setValue(`fields.${index}.label`, ticker, { shouldDirty: true })}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {/* Add field dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs w-full"
                  >
                    <Plus className="size-3 mr-1" /> Add Field
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="w-48">
                  <DropdownMenuItem onClick={() => append({ label: '', value: '', type: 'text' })}>
                    <Type className="size-4 mr-2" />
                    Text
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => append({ label: '$BTC', value: '', type: 'wallet' })}>
                    <Wallet className="size-4 mr-2" />
                    Wallet Address
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => append({ label: '', value: '', type: 'media' })}>
                    <Image className="size-4 mr-2" />
                    Media
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Advanced */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent hover:text-foreground">
                <span className="text-sm font-medium">Advanced</span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3">
              <FormField
                control={form.control}
                name="bot"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="text-sm">Bot Account</FormLabel>
                      <FormDescription className="text-xs">Mark this account as automated</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Save */}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Save Profile
          </Button>

        </form>
      </Form>
    </main>
  );
}
