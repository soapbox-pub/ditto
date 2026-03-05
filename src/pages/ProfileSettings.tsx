import { useSeoMeta } from '@unhead/react';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Loader2, Plus, Trash2, ChevronDown } from 'lucide-react';
import { IntroImage } from '@/components/IntroImage';
import { Link, Navigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';

import { ProfileCard } from '@/components/ProfileCard';
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

const formSchema = n.metadata().extend({
  fields: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
});

type FormValues = z.infer<typeof formSchema>;

type CropState = {
  imageSrc: string;
  aspect: number;
  field: 'picture' | 'banner';
  title: string;
};

export function ProfileSettings() {
  const { user, metadata, event } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const [cropState, setCropState] = useState<CropState | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useSeoMeta({
    title: `Profile | Settings | ${config.appName}`,
    description: `Edit your ${config.appName} profile`,
  });

  // Parse existing custom fields from raw event
  const parseFields = (): Array<{ label: string; value: string }> => {
    if (!event) return [];
    try {
      const parsed = JSON.parse(event.content);
      if (Array.isArray(parsed.fields)) {
        return parsed.fields
          .filter((f: unknown) => Array.isArray(f) && f.length >= 2)
          .map((f: string[]) => ({ label: f[0], value: f[1] }));
      }
    } catch { /* ignore */ }
    return [];
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', about: '', picture: '', banner: '',
      website: '', nip05: '', lud16: '', bot: false, fields: [],
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fields, append, remove } = useFieldArray({ control: form.control as any, name: 'fields' });

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
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata, event]);

  // Live values for the card preview
  const watched = form.watch();
  const cardMetadata: Partial<NostrMetadata> = {
    name: watched.name,
    about: watched.about,
    picture: watched.picture,
    banner: watched.banner,
    website: watched.website,
    nip05: watched.nip05,
    lud16: watched.lud16,
    bot: watched.bot,
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
      const { fields: customFields, ...standardMetadata } = values;
      const data: Record<string, unknown> = { ...metadata, ...standardMetadata };
      for (const key in data) {
        if (data[key] === '') delete data[key];
      }
      if (customFields && customFields.length > 0) {
        const nonEmpty = customFields.filter(f => f.label.trim() && f.value.trim());
        if (nonEmpty.length > 0) data.fields = nonEmpty.map(f => [f.label, f.value]);
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
      {/* Hidden file input */}
      <input
        ref={pickInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChosen}
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
            <p className="text-sm text-muted-foreground mt-0.5">Edit your display name, bio, and avatar</p>
          </div>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl mx-auto px-4 space-y-6">

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

          {/* Profile fields — collapsible */}
          <Collapsible open={fieldsOpen} onOpenChange={setFieldsOpen}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent">
                <span className="text-sm font-medium">Profile Fields</span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-3 pt-3">
              {/* Website — always first */}
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <div className="grid grid-cols-[1fr,2fr,auto] gap-2 items-center">
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
                  <div className="grid grid-cols-[1fr,2fr,auto] gap-2 items-center">
                    <div className="flex items-center h-9 px-3 text-sm text-muted-foreground">
                      <span>Lightning</span>
                    </div>
                    <Input placeholder="you@walletofsatoshi.com" {...field} className="h-9" />
                    <div className="size-9" />
                  </div>
                )}
              />

              {fields.map((field, index) => (
                <div key={field.id} className="grid grid-cols-[1fr,2fr,auto] gap-2 items-start">
                  <FormField
                    control={form.control}
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
                  <FormField
                    control={form.control}
                    name={`fields.${index}.value`}
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Input placeholder="Value or URL" {...field} className="h-9" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(index)}
                    className="h-9 w-9 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}

              {/* Add button at bottom */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ label: '', value: '' })}
                className="h-8 text-xs w-full"
              >
                <Plus className="size-3 mr-1" /> Add Field
              </Button>
            </CollapsibleContent>
          </Collapsible>

          {/* Advanced */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent">
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
