import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useToast } from '@/hooks/useToast';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Loader2, Upload, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';
import { useUploadFile } from '@/hooks/useUploadFile';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { z } from 'zod';
import { IntroImage } from '@/components/IntroImage';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { isValidAvatarShape } from '@/lib/avatarShape';

// Extended form schema that includes custom fields and avatar shape
const formSchema = n.metadata().extend({
  fields: z.array(z.object({
    label: z.string(),
    value: z.string(),
  })).optional(),
  shape: z.string().optional(),
});

type ExtendedMetadata = z.infer<typeof formSchema>;

interface EditProfileFormProps {
  /** Called whenever form values change — used by the live preview */
  onValuesChange?: (values: Partial<NostrMetadata>) => void;
}

export const EditProfileForm: React.FC<EditProfileFormProps> = ({ onValuesChange }) => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const { user, metadata, event } = useCurrentUser();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  // Crop dialog state
  const [cropState, setCropState] = useState<{
    open: boolean;
    imageSrc: string;
    aspect: number;
    field: 'picture' | 'banner';
    title: string;
  } | null>(null);

  // Parse existing fields from raw event content
  const parseFields = (): Array<{ label: string; value: string }> => {
    if (!event) return [];
    try {
      const parsed = JSON.parse(event.content);
      if (Array.isArray(parsed.fields)) {
        return parsed.fields
          .filter((f: unknown) => Array.isArray(f) && f.length >= 2)
          .map((f: string[]) => ({ label: f[0], value: f[1] }));
      }
    } catch {
      // Invalid JSON or no fields
    }
    return [];
  };

  // Parse existing shape from raw event content
  const parseShape = (): string => {
    if (!event) return '';
    try {
      const parsed = JSON.parse(event.content);
      if (isValidAvatarShape(parsed.shape)) return parsed.shape;
    } catch { /* ignore */ }
    return '';
  };

  // Initialize the form with default values
  const form = useForm<ExtendedMetadata>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      about: '',
      picture: '',
      banner: '',
      website: '',
      nip05: '',
      lud16: '',
      bot: false,
      fields: [],
      shape: '',
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fields, append, remove } = useFieldArray({ control: form.control as any, name: 'fields' });

  // Update form values when user data is loaded
  useEffect(() => {
    if (metadata) {
      const existingFields = parseFields();
      form.reset({
        name: metadata.name || '',
        about: metadata.about || '',
        picture: metadata.picture || '',
        banner: metadata.banner || '',
        website: metadata.website || '',
        nip05: metadata.nip05 || '',
        lud16: metadata.lud16 || '',
        bot: metadata.bot || false,
        fields: existingFields,
        shape: parseShape(),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metadata, event]);

  // Propagate live preview changes
  const notifyChange = useCallback(() => {
    if (!onValuesChange) return;
    const v = form.getValues();
    onValuesChange({
      name: v.name,
      display_name: v.display_name,
      about: v.about,
      picture: v.picture,
      banner: v.banner,
      website: v.website,
      nip05: v.nip05,
      lud16: v.lud16,
      bot: v.bot,
      shape: v.shape,
    } as Partial<NostrMetadata>);
  }, [form, onValuesChange]);

  // Watch all fields and propagate
  useEffect(() => {
    const sub = form.watch(() => notifyChange());
    return () => sub.unsubscribe();
  }, [form, notifyChange]);

  // Open crop dialog when user picks a file
  const openCropDialog = (file: File, field: 'picture' | 'banner') => {
    const objectUrl = URL.createObjectURL(file);
    setCropState({
      open: true,
      imageSrc: objectUrl,
      aspect: field === 'picture' ? 1 : 3,
      field,
      title: field === 'picture' ? t('editProfile.cropPictureTitle') : t('editProfile.cropBannerTitle'),
    });
  };

  // Handle cropped blob — upload it
  const handleCropConfirm = async (blob: Blob) => {
    if (!cropState) return;
    const { field, imageSrc } = cropState;
    setCropState(null);
    URL.revokeObjectURL(imageSrc);

    const file = new File([blob], `${field}.jpg`, { type: 'image/jpeg' });
    try {
      const [[, url]] = await uploadFile(file);
      form.setValue(field, url);
      notifyChange();
      toast({
        title: t('editProfile.toast.success'),
        description: field === 'picture' ? t('editProfile.toast.pictureUploaded') : t('editProfile.toast.bannerUploaded'),
      });
    } catch (error) {
      console.error(`Failed to upload ${field}:`, error);
      toast({
        title: t('editProfile.toast.error'),
        description: field === 'picture' ? t('editProfile.toast.pictureUploadFailed') : t('editProfile.toast.bannerUploadFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleCropCancel = () => {
    if (cropState) {
      URL.revokeObjectURL(cropState.imageSrc);
      setCropState(null);
    }
  };

  const onSubmit = async (values: ExtendedMetadata) => {
    if (!user) {
      toast({
        title: t('editProfile.toast.error'),
        description: t('editProfile.toast.notLoggedIn'),
        variant: 'destructive',
      });
      return;
    }

    try {
      // Extract fields, shape, and other metadata
      const { fields: customFields, shape, ...standardMetadata } = values;

      // Combine existing metadata with new values
      const data: Record<string, unknown> = { ...metadata, ...standardMetadata };

      // Add shape only if set (an emoji string)
      if (shape && isValidAvatarShape(shape)) {
        data.shape = shape;
      } else {
        delete data.shape;
      }

      // Clean up empty values in standard metadata
      for (const key in data) {
        if (data[key] === '') {
          delete data[key];
        }
      }

      // Add custom fields if they exist (convert to array format)
      if (customFields && customFields.length > 0) {
        const nonEmptyFields = customFields.filter(f => f.label.trim() && f.value.trim());
        if (nonEmptyFields.length > 0) {
          data.fields = nonEmptyFields.map(f => [f.label, f.value]);
        }
      }

      // Publish the metadata event (kind 0)
      const published = await publishEvent({
        kind: 0,
        content: JSON.stringify(data),
      });

      // Optimistically seed the author cache from the freshly-signed event so
      // the profile name/avatar update immediately, before the relay confirms
      // and the queries below refetch.
      queryClient.setQueryData(['author', user.pubkey], parseAuthorEvent(published));

      // Invalidate queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ['logins'] });
      queryClient.invalidateQueries({ queryKey: ['author', user.pubkey] });

      toast({
        title: t('editProfile.toast.success'),
        description: t('editProfile.toast.profileUpdated'),
      });
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast({
        title: t('editProfile.toast.error'),
        description: t('editProfile.toast.updateFailed'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      {/* Intro */}
      <div className="flex items-center gap-4 px-3 pt-2 pb-4">
        <IntroImage src="/profile-intro.png" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t('editProfile.identity.title')}</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
            {t('editProfile.identity.description')}
          </p>
        </div>
      </div>

      {/* Crop dialog */}
      {cropState && (
        <ImageCropDialog
          open={cropState.open}
          imageSrc={cropState.imageSrc}
          aspect={cropState.aspect}
          title={cropState.title}
          onCancel={handleCropCancel}
          onCrop={handleCropConfirm}
        />
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 px-3">
          <div className="border-b border-border pb-5">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">{t('editProfile.name.label')}</FormLabel>
                  <FormControl>
                    <Input placeholder={t('editProfile.name.placeholder')} {...field} className="h-9" />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t('editProfile.name.description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="border-b border-border pb-5">
            <FormField
              control={form.control}
              name="about"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-medium">{t('editProfile.about.label')}</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder={t('editProfile.about.placeholder')}
                      className="resize-none min-h-20"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className="text-xs">
                    {t('editProfile.about.description')}
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="border-b border-border pb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="picture"
                render={({ field }) => (
                  <ImageUploadField
                    field={field}
                    label={t('editProfile.picture.label')}
                    placeholder="https://example.com/profile.jpg"
                    description={t('editProfile.picture.description')}
                    previewType="square"
                    onPickFile={(file) => openCropDialog(file, 'picture')}
                  />
                )}
              />

              <FormField
                control={form.control}
                name="banner"
                render={({ field }) => (
                  <ImageUploadField
                    field={field}
                    label={t('editProfile.banner.label')}
                    placeholder="https://example.com/banner.jpg"
                    description={t('editProfile.banner.description')}
                    previewType="wide"
                    onPickFile={(file) => openCropDialog(file, 'banner')}
                  />
                )}
              />
            </div>
          </div>

          <div className="border-b border-border pb-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">{t('editProfile.website.label')}</FormLabel>
                    <FormControl>
                      <Input placeholder="https://yourwebsite.com" {...field} className="h-9" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {t('editProfile.website.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="nip05"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">{t('editProfile.nip05.label')}</FormLabel>
                    <FormControl>
                      <Input placeholder="you@example.com" {...field} className="h-9" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {t('editProfile.nip05.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lud16"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs font-medium">{t('editProfile.lud16.label')}</FormLabel>
                    <FormControl>
                      <Input placeholder="you@walletofsatoshi.com" {...field} className="h-9" />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {t('editProfile.lud16.description')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>

          {/* Custom Profile Fields */}
          <div className="border-b border-border pb-5">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <FormLabel className="text-xs font-medium">{t('editProfile.fields.label')}</FormLabel>
                  <FormDescription className="text-xs mt-1">
                    {t('editProfile.fields.description')}
                  </FormDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ label: '', value: '' })}
                  className="h-8 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  {t('editProfile.fields.addField')}
                </Button>
              </div>

              {fields.length > 0 && (
                <div className="space-y-3 pt-2">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-[1fr,2fr,auto] gap-2 items-start">
                      <FormField
                        control={form.control}
                        name={`fields.${index}.label`}
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                placeholder={t('editProfile.fields.labelPlaceholder')}
                                {...field}
                                className="h-9"
                              />
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
                              <Input
                                placeholder={t('editProfile.fields.valuePlaceholder')}
                                {...field}
                                className="h-9"
                              />
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
                        title={t('editProfile.fields.removeField')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Advanced Settings */}
          <div className="border-b border-border pb-5">
            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between p-0 h-auto hover:bg-transparent"
                >
                  <span className="text-xs font-medium text-muted-foreground">{t('editProfile.advanced')}</span>
                  {showAdvanced ? (
                    <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <FormField
                  control={form.control}
                  name="bot"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel className="text-sm">{t('editProfile.bot.label')}</FormLabel>
                        <FormDescription className="text-xs">
                          {t('editProfile.bot.description')}
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                          className="scale-90"
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="pt-2 pb-4">
            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={isPending || isUploading}
            >
              {(isPending || isUploading) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t('editProfile.save')}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
};

// Reusable component for image upload fields
interface ImageUploadFieldProps {
  field: {
    value: string | undefined;
    onChange: (value: string) => void;
    name: string;
    onBlur: () => void;
  };
  label: string;
  placeholder: string;
  description: string;
  previewType: 'square' | 'wide';
  onPickFile: (file: File) => void;
}

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  field,
  label,
  placeholder,
  description,
  previewType,
  onPickFile,
}) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <FormItem>
      <FormLabel className="text-xs font-medium">{label}</FormLabel>
      <div className="flex flex-col gap-2">
        <FormControl>
          <Input
            placeholder={placeholder}
            name={field.name}
            value={field.value ?? ''}
            onChange={e => field.onChange(e.target.value)}
            onBlur={field.onBlur}
            className="h-9"
          />
        </FormControl>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                onPickFile(file);
                // Reset input so re-selecting same file triggers onChange
                e.target.value = '';
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="h-8 text-xs"
          >
            <Upload className="h-3 w-3 mr-1.5" />
            {t('editProfile.uploadCrop')}
          </Button>
          {field.value && (
            <div className={`h-8 ${previewType === 'square' ? 'w-8' : 'w-20'} rounded overflow-hidden border`}>
              <img
                src={field.value}
                alt={t('editProfile.previewAlt', { label })}
                className="h-full w-full object-cover"
              />
            </div>
          )}
        </div>
      </div>
      <FormDescription className="text-xs">
        {description}
      </FormDescription>
      <FormMessage />
    </FormItem>
  );
};
