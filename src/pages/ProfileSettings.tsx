import { useSeoMeta } from '@/hooks/useSeoMeta';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2, Plus, Trash2, ChevronDown,
  Wallet, Upload, Music, ImageIcon, Film, Mail, Link2, Pencil, Eye, EyeOff, Copy, Check, Download, KeyRound, AlertTriangle, CloudSun, Cake,
} from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { useNostr } from '@nostrify/react';
import { useNostrLogin } from '@nostrify/react/login';
import { useTranslation } from 'react-i18next';

import { saveNsec } from '@/lib/credentialManager';
import { fetchFreshEvent } from '@/lib/fetchFreshEvent';
import { parseBirthdayFromContent, daysInMonth, type Birthday } from '@/lib/birthday';
import { useLayoutOptions, useNavHidden } from '@/contexts/LayoutContext';
import { cn } from '@/lib/utils';
import { Navigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { NSchema as n } from '@nostrify/nostrify';
import type { NostrMetadata } from '@nostrify/nostrify';
import { useQueryClient } from '@tanstack/react-query';

import { ProfileCard } from '@/components/ProfileCard';
import { ProfileRightSidebar } from '@/components/ProfileRightSidebar';
import { PageHeader } from '@/components/PageHeader';
import { IntroImage } from '@/components/IntroImage';
import { HelpTip } from '@/components/HelpTip';
import { ImageCropDialog } from '@/components/ImageCropDialog';
import { SortableList, SortableItem } from '@/components/SortableList';
import { PaymentTargetsEditor, type PaymentTargetsEditorHandle } from '@/components/PaymentTargetsEditor';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { parseAuthorEvent } from '@/hooks/useAuthor';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useNostrStorage } from '@/hooks/useNostrStorage';
import { useUploadFile } from '@/hooks/useUploadFile';

import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isValidAvatarShape } from '@/lib/avatarShape';

// ── Constants ─────────────────────────────────────────────────────────────────

const WALLET_TICKERS = [
  '$BTC', '$ETH', '$SOL', '$XMR', '$LTC', '$DOGE', '$ADA', '$DOT', '$XRP', '$MATIC',
] as const;

/** Bare tickers used only for detection (strips leading $). */
const BARE_TICKERS = WALLET_TICKERS.map((t) => t.slice(1));

// ── Field preset templates ────────────────────────────────────────────────────

interface FieldPreset {
  id: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Default label to pre-fill when adding this field type. */
  defaultLabel: string;
  /** The form field type. */
  type: 'text' | 'wallet' | 'media';
  /** File accept attribute for the file picker (media types only). */
  accept?: string;
  /** Placeholder for the value input. */
  valuePlaceholder?: string;
}

/**
 * Build the preset list with translated text. Universal example values
 * (emoji labels, tickers, example URLs) stay as literals.
 */
function getFieldPresets(t: (key: string) => string): { fieldPresets: FieldPreset[]; customPreset: FieldPreset } {
  const fieldPresets: FieldPreset[] = [
    {
      id: 'music',
      label: t('settings.profile.fields.presets.music.label'),
      description: t('settings.profile.fields.presets.music.description'),
      icon: Music,
      defaultLabel: '\u{1F3B6}',
      type: 'media',
      accept: 'audio/*',
      valuePlaceholder: t('settings.profile.fields.presets.music.placeholder'),
    },
    {
      id: 'photo',
      label: t('settings.profile.fields.presets.photo.label'),
      description: t('settings.profile.fields.presets.photo.description'),
      icon: ImageIcon,
      defaultLabel: '\u{1F4F8}',
      type: 'media',
      accept: 'image/*',
      valuePlaceholder: t('settings.profile.fields.presets.photo.placeholder'),
    },
    {
      id: 'video',
      label: t('settings.profile.fields.presets.video.label'),
      description: t('settings.profile.fields.presets.video.description'),
      icon: Film,
      defaultLabel: '\u{1F3AC}',
      type: 'media',
      accept: 'video/*',
      valuePlaceholder: t('settings.profile.fields.presets.video.placeholder'),
    },
    {
      id: 'email',
      label: t('settings.profile.fields.presets.email.label'),
      description: t('settings.profile.fields.presets.email.description'),
      icon: Mail,
      defaultLabel: t('settings.profile.fields.presets.email.defaultLabel'),
      type: 'text',
      valuePlaceholder: 'you@example.com',
    },
    {
      id: 'wallet',
      label: t('settings.profile.fields.presets.wallet.label'),
      description: t('settings.profile.fields.presets.wallet.description'),
      icon: Wallet,
      defaultLabel: '$BTC',
      type: 'wallet',
      valuePlaceholder: t('settings.profile.fields.addressPlaceholder'),
    },
    {
      id: 'link',
      label: t('settings.profile.fields.presets.link.label'),
      description: t('settings.profile.fields.presets.link.description'),
      icon: Link2,
      defaultLabel: '',
      type: 'text',
      valuePlaceholder: 'https://...',
    },
    {
      id: 'weather',
      label: t('settings.profile.fields.presets.weather.label'),
      description: t('settings.profile.fields.presets.weather.description'),
      icon: CloudSun,
      defaultLabel: t('settings.profile.fields.presets.weather.defaultLabel'),
      type: 'text',
      valuePlaceholder: t('settings.profile.fields.presets.weather.placeholder'),
    },
  ];

  /** The "Custom" preset — always shown last, separated by a divider. */
  const customPreset: FieldPreset = {
    id: 'custom',
    label: t('settings.profile.fields.presets.custom.label'),
    description: t('settings.profile.fields.presets.custom.description'),
    icon: Pencil,
    defaultLabel: '',
    type: 'text',
    valuePlaceholder: t('settings.profile.fields.valueOrUrlPlaceholder'),
  };

  return { fieldPresets, customPreset };
}

/** Human-readable file-format lists shown in tooltips, keyed by accept filter. */
const FORMAT_HINTS: Record<string, string> = {
  'audio/*': 'MP3, OGG, WAV, FLAC, AAC, M4A, Opus',
  'image/*': 'JPG, PNG, GIF, WebP, SVG, AVIF',
  'video/*': 'MP4, WebM, MOV',
};

/** Find a preset's format hint from its accept filter. */
function getFormatHintForAccept(accept: string | undefined): string | undefined {
  if (!accept) return undefined;
  return FORMAT_HINTS[accept];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** Extension patterns for each media accept category. */
const AUDIO_EXT = /\.(mp3|mpga|ogg|oga|wav|flac|aac|m4a|opus|weba|webm|spx|caf)(\?.*)?$/i;
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|qt)(\?.*)?$/i;

/**
 * Check whether a pasted URL matches the expected file type for a media field.
 * Returns the i18n key of a warning message if the URL looks wrong, or
 * undefined if it's fine. Only warns when the value looks like a URL —
 * empty/non-URL values return undefined.
 */
function getMediaMismatchWarningKey(value: string, accept: string | undefined): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  // Only check if it looks like a URL
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) return undefined;

  // Blossom-style URLs (hex hash path) are always fine — type can't be determined from URL
  if (/^https?:\/\/.+\/[0-9a-f]{64}(\.\w+)?$/i.test(trimmed)) return undefined;

  // Check if URL has a recognizable file extension at all
  const hasAudioExt = AUDIO_EXT.test(trimmed);
  const hasImageExt = IMAGE_EXT.test(trimmed);
  const hasVideoExt = VIDEO_EXT.test(trimmed);
  const hasKnownExt = hasAudioExt || hasImageExt || hasVideoExt;

  if (accept === 'audio/*') {
    if (hasKnownExt && !hasAudioExt) {
      return 'settings.profile.fields.warnings.audioMismatch';
    }
    if (!hasKnownExt) {
      return 'settings.profile.fields.warnings.audioMaybe';
    }
  }

  if (accept === 'image/*') {
    if (hasKnownExt && !hasImageExt) {
      return 'settings.profile.fields.warnings.imageMismatch';
    }
    if (!hasKnownExt) {
      return 'settings.profile.fields.warnings.imageMaybe';
    }
  }

  if (accept === 'video/*') {
    if (hasKnownExt && !hasVideoExt) {
      return 'settings.profile.fields.warnings.videoMismatch';
    }
    if (!hasKnownExt) {
      return 'settings.profile.fields.warnings.videoMaybe';
    }
  }

  return undefined;
}

/** Infer a file-accept filter from an existing field's value URL. */
function inferAcceptFromValue(value: string): string | undefined {
  if (/\.(mp3|mpga|ogg|oga|wav|flac|aac|m4a|opus|weba|webm|spx|caf)(\?.*)?$/i.test(value)) return 'audio/*';
  if (/\.(jpe?g|png|gif|webp|svg|avif)(\?.*)?$/i.test(value)) return 'image/*';
  if (/\.(mp4|webm|mov|qt)(\?.*)?$/i.test(value)) return 'video/*';
  return undefined;
}

// ── Schema ────────────────────────────────────────────────────────────────────

const formSchema = n.metadata().extend({
  fields: z.array(z.object({
    label: z.string(),
    value: z.string(),
    type: z.enum(['text', 'wallet', 'media']),
    /** Client-side only — file accept filter for the file picker (not persisted). */
    accept: z.string().optional(),
    /** Client-side only — placeholder text for the value input (not persisted). */
    placeholder: z.string().optional(),
  })).optional(),
  shape: z.string().optional(),
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
  accept?: string;
  valuePlaceholder?: string;
  isUploading?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: any;
  onRemove: () => void;
  onMediaPick: () => void;
  onTickerChange: (ticker: string) => void;
}

function SortableFieldRow({ id, index, type, accept, valuePlaceholder, isUploading: fieldUploading, control, onRemove, onMediaPick, onTickerChange }: SortableFieldRowProps) {
  const { t } = useTranslation();
  const formatHint = type === 'media' ? getFormatHintForAccept(accept) : undefined;

  return (
    <SortableItem id={id} className="items-start" gripClassName="w-6 h-9">
      <div className="grid grid-cols-[1fr,2fr,auto] gap-2 items-start">
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
                    <SelectValue placeholder={t('settings.profile.fields.tickerPlaceholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {WALLET_TICKERS.map((ticker) => (
                    <SelectItem key={ticker} value={ticker}>{ticker}</SelectItem>
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
                <Input placeholder={t('settings.profile.fields.labelPlaceholder')} {...field} className="h-9" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Value column — media gets upload button with tooltip, others get text input */}
      {type === 'media' ? (
        <FormField
          control={control}
          name={`fields.${index}.value`}
          render={({ field }) => {
            const mismatchWarningKey = getMediaMismatchWarningKey(field.value, accept);
            return (
              <FormItem>
                <div className="flex gap-1.5">
                  <FormControl>
                    <Input placeholder={valuePlaceholder || t('settings.profile.fields.mediaPlaceholder')} {...field} className="h-9 flex-1 min-w-0" readOnly={false} />
                  </FormControl>
                  {fieldUploading ? (
                    <div className="flex items-center justify-center h-9 w-9 shrink-0">
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-9 w-9 shrink-0"
                          onClick={onMediaPick}
                        >
                          <Upload className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-52">
                        {formatHint ? (
                          <span>{t('settings.profile.fields.uploadTooltip')}<br /><span className="text-muted-foreground">{formatHint}</span></span>
                        ) : (
                          <span>{t('settings.profile.fields.uploadTooltipMedia')}</span>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                {mismatchWarningKey && (
                  <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-500 mt-1 leading-snug">
                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                    <span>{t(mismatchWarningKey)}</span>
                  </p>
                )}
                <FormMessage />
              </FormItem>
            );
          }}
        />
      ) : (
        <FormField
          control={control}
          name={`fields.${index}.value`}
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Input placeholder={type === 'wallet' ? t('settings.profile.fields.addressPlaceholder') : t('settings.profile.fields.valueOrUrlPlaceholder')} {...field} className="h-9" />
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
    </SortableItem>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProfileSettings() {
  const { t } = useTranslation();
  const { user, metadata, event } = useCurrentUser();
  const { config } = useAppContext();
  const queryClient = useQueryClient();
  const { mutateAsync: publishEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();

  const [cropState, setCropState] = useState<CropState | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const [uploadingFieldIndex, setUploadingFieldIndex] = useState<number>(-1);

  useSeoMeta({
    title: `${t('settings.profile.title')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.profile.metaDescription', { appName: config.appName }),
  });

  // Preset templates for the "add field" buttons, with translated labels.
  const { fieldPresets, customPreset } = getFieldPresets(t);

  // Parse existing custom fields from raw event
  const parseFields = (): Array<{ label: string; value: string; type: 'text' | 'wallet' | 'media'; accept?: string }> => {
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
            const accept = type === 'media' ? inferAcceptFromValue(f[1]) : undefined;
            return { label, value: f[1], type, accept };
          });
      }
    } catch { /* ignore */ }
    return [];
  };

  const parseShape = (): string => {
    if (!event) return '';
    try {
      const parsed = JSON.parse(event.content);
      if (isValidAvatarShape(parsed.shape)) return parsed.shape;
    } catch { /* ignore */ }
    return '';
  };

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '', about: '', picture: '', banner: '',
      website: '', nip05: '', lud16: '', bot: false, fields: [],
      shape: '',
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fields, append, remove, move } = useFieldArray({ control: form.control as any, name: 'fields' });

  const handleFieldReorder = useCallback((reordered: typeof fields) => {
    // Map reordered items back to move() calls by finding the first mismatch
    const oldIndex = fields.findIndex((f, i) => f.id !== reordered[i]?.id);
    if (oldIndex === -1) return;
    const newIndex = reordered.findIndex((f) => f.id === fields[oldIndex].id);
    if (newIndex === -1) return;
    move(oldIndex, newIndex);
  }, [fields, move]);

  // Media field upload — dynamic accept attribute per field
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const pendingMediaIndex = useRef<number>(-1);
  const handleMediaPick = (index: number) => {
    pendingMediaIndex.current = index;
    // Dynamically set the accept attribute based on the field's preset
    const fieldAccept = form.getValues(`fields.${index}.accept`);
    if (mediaInputRef.current) {
      mediaInputRef.current.accept = fieldAccept || 'image/*,video/*,audio/*';
    }
    mediaInputRef.current?.click();
  };
  const handleMediaFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    const index = pendingMediaIndex.current;
    if (index < 0) return;
    setUploadingFieldIndex(index);
    try {
      const [[, url]] = await uploadFile(file);
      form.setValue(`fields.${index}.value`, url, { shouldDirty: true });
      toast({ title: t('settings.profile.uploaded'), description: t('settings.profile.mediaUploaded') });
    } catch {
      toast({ title: t('settings.profile.uploadFailed'), description: t('settings.profile.uploadFailedDescription'), variant: 'destructive' });
    } finally {
      setUploadingFieldIndex(-1);
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
  const cardMetadata: Partial<NostrMetadata> & { shape?: string } = {
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

  // Live sidebar preview fields — computed from watched form values
  const previewFields = useMemo(() => {
    const result: Array<{ label: string; value: string }> = [];
    // Add website if present
    if (watched.website?.trim()) {
      result.push({ label: t('settings.profile.fields.websiteLabel'), value: watched.website.trim() });
    }
    // Add custom fields that have both label and value
    if (watched.fields) {
      for (const f of watched.fields) {
        if (f.label.trim() && f.value.trim()) {
          result.push({ label: f.label, value: f.value });
        }
      }
    }
    return result;
  }, [watched.website, watched.fields, t]);

  // Card onChange: patch individual fields
  const handleCardChange = (patch: Partial<NostrMetadata>) => {
    for (const [k, v] of Object.entries(patch)) {
      form.setValue(k as keyof FormValues, v as string, { shouldDirty: true });
    }
  };

  // Image pick: open crop dialog
  const pickInputRef = useRef<HTMLInputElement>(null);
  const pendingField = useRef<'picture' | 'banner'>('picture');
  const paymentTargetsRef = useRef<PaymentTargetsEditorHandle>(null);

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
      title: field === 'picture' ? t('settings.profile.cropPictureTitle') : t('settings.profile.cropBannerTitle'),
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
      toast({
        title: t('settings.profile.uploaded'),
        description: field === 'picture' ? t('settings.profile.pictureUpdated') : t('settings.profile.bannerUpdated'),
      });
    } catch {
      toast({ title: t('settings.profile.uploadFailed'), description: t('settings.profile.uploadFailedDescription'), variant: 'destructive' });
    }
  };

  const handleCropCancel = () => {
    if (cropState) URL.revokeObjectURL(cropState.imageSrc);
    setCropState(null);
  };

  // Handle adding a field from a preset
  const handleAddPreset = (preset: FieldPreset) => {
    append({
      label: preset.defaultLabel,
      value: '',
      type: preset.type,
      accept: preset.accept,
      placeholder: preset.valuePlaceholder,
    });
  };

  const onSubmit = async (values: FormValues) => {
    if (!user) return;
    try {
      const { fields: customFields, shape, ...standardMetadata } = values;
      const data: Record<string, unknown> = { ...metadata, ...standardMetadata };

      // Add shape only if set (an emoji string)
      if (shape && isValidAvatarShape(shape)) {
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

      // Persist payment targets (kind 10133) alongside the profile. If it
      // fails or doesn't validate, the editor surfaces its own error toast;
      // skip the success confirmation so the user knows something was off.
      const targetsSaved = (await paymentTargetsRef.current?.save()) ?? true;
      if (!targetsSaved) return;

      toast({ title: t('settings.profile.saved') });
    } catch {
      toast({ title: t('settings.profile.saveError'), description: t('settings.profile.saveErrorDescription'), variant: 'destructive' });
    }
  };

  // Inject live sidebar preview into the app's right sidebar slot
  useLayoutOptions({
    rightSidebar: <ProfileRightSidebar fields={previewFields} pubkey={user?.pubkey} />,
  });

  // Whether the mobile top bar has slid away (user scrolled down). The sticky
  // page header follows it up to top-0 so no gap opens above it — the same
  // "pinned" behavior SubHeaderBar implements for tab bars.
  const navHidden = useNavHidden();

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
      {/* Hidden file input for media fields — accept is set dynamically */}
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

      {/* Header — sticks to the top so Save stays reachable while scrolling.
          When the mobile top bar hides on scroll, slide up to top-0 (with
          safe-area padding) instead of leaving a gap, mirroring
          SubHeaderBar's `pinned` mode. */}
      <PageHeader
        title={t('settings.profile.title')}
        backTo="/settings"
        alwaysShowBack
        className={cn(
          'sticky top-mobile-bar sidebar:top-0 z-20 backdrop-blur-md border-b border-border',
          'max-sidebar:transition-[top,padding-top] max-sidebar:duration-300 max-sidebar:ease-in-out',
          navHidden && 'header-pinned-top',
        )}
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold leading-tight">{t('settings.profile.title')}</h1>
          </div>
        }
      >
        <Button type="submit" form="profile-settings-form" size="sm" className="shrink-0 rounded-full font-bold px-5" disabled={busy}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : t('common.save')}
        </Button>
      </PageHeader>

      <Form {...form}>
        <form id="profile-settings-form" onSubmit={form.handleSubmit(onSubmit)} className="max-w-xl mx-auto px-4 pb-10 space-y-6">

          {/* Intro */}
          <div className="flex items-center gap-4 px-3 pt-2 pb-2">
            <IntroImage src="/profile-intro.png" />
            <div className="min-w-0">
              <h2 className="text-sm font-semibold">{t('settings.profile.identity.title')}</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {t('settings.profile.identity.description')}
              </p>
            </div>
          </div>

          {/* Interactive profile card */}
          <ProfileCard
            pubkey={user.pubkey}
            metadata={cardMetadata}
            onChange={handleCardChange}
            onPickImage={handlePickImage}
            onAvatarShape={(shape) => form.setValue('shape', shape, { shouldDirty: true })}
            onRemoveAvatar={() => form.setValue('picture', '', { shouldDirty: true })}
          />

          {isUploading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('settings.profile.uploading')}
            </div>
          )}

          {/* Profile fields */}
          <div>
            <h2 className="text-sm font-medium py-2 flex items-center gap-1">
              {t('settings.profile.fields.title')}
              <HelpTip faqId="profile-fields" iconSize="size-3.5" />
            </h2>

            <div className="space-y-3 pt-1">
              {/* Website — always first */}
              <FormField
                control={form.control}
                name="website"
                render={({ field }) => (
                  <div className="grid grid-cols-[auto,1fr,2fr,auto] gap-2 items-center">
                    <div className="w-6" />
                    <div className="flex items-center h-9 px-3 text-sm text-muted-foreground">
                      <span>{t('settings.profile.fields.websiteLabel')}</span>
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
                      <span>{t('settings.profile.fields.lightningLabel')}</span>
                      <HelpTip faqId="what-are-zaps" iconSize="size-3.5" />
                    </div>
                    <Input placeholder="you@walletofsatoshi.com" {...field} className="h-9" />
                    <div className="size-9" />
                  </div>
                )}
              />

              <SortableList
                items={fields}
                getItemId={(field) => field.id}
                onReorder={handleFieldReorder}
                className="space-y-3"
                renderItem={(field, index) => (
                  <SortableFieldRow
                    key={field.id}
                    id={field.id}
                    index={index}
                    type={form.watch(`fields.${index}.type`) ?? 'text'}
                    accept={form.watch(`fields.${index}.accept`)}
                    valuePlaceholder={form.watch(`fields.${index}.placeholder`)}
                    isUploading={uploadingFieldIndex === index}
                    control={form.control}
                    onRemove={() => remove(index)}
                    onMediaPick={() => handleMediaPick(index)}
                    onTickerChange={(ticker) => form.setValue(`fields.${index}.label`, ticker, { shouldDirty: true })}
                  />
                )}
              />

              {/* Add field — visible pill buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {[...fieldPresets, customPreset].map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <Tooltip key={preset.id}>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 rounded-full px-3 text-xs gap-1.5"
                          onClick={() => handleAddPreset(preset)}
                        >
                          <Plus className="size-3 text-muted-foreground" />
                          <Icon className="size-3.5 text-muted-foreground" />
                          {preset.label}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {preset.description}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>

            </div>
          </div>

          {/* Mobile sidebar preview — visible only below widgets where the real sidebar is hidden */}
          <div className="lg:hidden">
            <Collapsible open={showMobilePreview} onOpenChange={setShowMobilePreview}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent hover:text-foreground">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Eye className="size-3.5" />
                    {t('settings.profile.fields.previewTitle')}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-3">
                <div className="rounded-xl border bg-card/50 overflow-hidden">
                  <ProfileRightSidebar
                    fields={previewFields}
                    className="relative w-full flex flex-col h-auto max-h-[60vh] overflow-y-auto"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Birthday — NIP-24 birthday field. Self-contained: publishes its
              own atomic kind-0 update (read-modify-write against the freshest
              profile) with its own save button, independent of the main form
              above so a birthday change never drags along unsaved edits. */}
          <div className="border-t pt-5">
            <BirthdaySection />
          </div>

          {/* Accept Donations — NIP-A3 payment targets (kind 10133). Self-
              contained: publishes its own event with its own save button,
              independent of the kind-0 profile form above. */}
          <div className="border-t pt-5">
            <PaymentTargetsEditor ref={paymentTargetsRef} />
          </div>

          {/* Advanced */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent hover:text-foreground">
                <span className="text-sm font-medium">{t('settings.profile.advanced')}</span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-4">
              <FormField
                control={form.control}
                name="bot"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <FormLabel className="text-sm">{t('settings.profile.bot.label')}</FormLabel>
                      <FormDescription className="text-xs">{t('settings.profile.bot.description')}</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Your Key — private-key backup. Rendered inside Advanced but is not part of the form. */}
              <div className="pt-2">
                <BackupKeySection />
              </div>
            </CollapsibleContent>
          </Collapsible>

        </form>
      </Form>
    </main>
  );
}

// ── Birthday section ──────────────────────────────────────────────────────────

/** i18n key suffixes for the twelve month names, in calendar order. */
const MONTH_KEYS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
] as const;

/**
 * Standalone NIP-24 birthday editor.
 *
 * Saves atomically: fetches the freshest kind 0 from relays, patches only the
 * `birthday` key in its content JSON, and republishes — so it can never
 * clobber profile edits made elsewhere, and the main form's Save can never
 * lose a birthday (the whole-form save merges over parsed metadata, which
 * passes unknown keys through).
 *
 * Per NIP-24 every field is optional — month/day without a year is fine.
 */
function BirthdaySection() {
  const { t } = useTranslation();
  const { user, event } = useCurrentUser();
  const { nostr } = useNostr();
  const { store } = useNostrStorage();
  const { mutateAsync: publishEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const stored = useMemo(() => parseBirthdayFromContent(event?.content), [event?.content]);

  const [month, setMonth] = useState<number | undefined>(undefined);
  const [day, setDay] = useState<number | undefined>(undefined);
  const [year, setYear] = useState('');
  const [yearBlurred, setYearBlurred] = useState(false);
  const [saving, setSaving] = useState(false);

  // Sync local state whenever the published profile changes.
  useEffect(() => {
    setMonth(stored?.month);
    setDay(stored?.day);
    setYear(stored?.year !== undefined ? String(stored.year) : '');
  }, [stored]);

  const yearTrimmed = year.trim();
  const yearNum = yearTrimmed ? Number(yearTrimmed) : undefined;
  const currentYear = new Date().getFullYear();
  // Year is entirely optional (NIP-24) — blank is always valid. Only a
  // non-empty value that isn't a sane 4-digit year blocks saving.
  const yearInvalid = yearTrimmed !== '' && (
    !/^\d{4}$/.test(yearTrimmed) || yearNum! < 1900 || yearNum! > currentYear
  );
  // Don't flag a half-typed year — only complain once the field has a full
  // 4 digits or the user has left it.
  const showYearInvalid = yearInvalid && (yearBlurred || yearTrimmed.length >= 4);

  const dirty =
    month !== stored?.month ||
    day !== stored?.day ||
    (yearInvalid ? false : yearNum !== stored?.year);

  const isEmpty = month === undefined && day === undefined && yearTrimmed === '';
  const hasStored = stored !== undefined;

  const publishBirthday = async (birthday: Birthday | undefined) => {
    if (!user) return;
    setSaving(true);
    try {
      // Read-modify-write against the freshest kind 0, falling back to the
      // locally cached event so a relay miss can't wipe the profile.
      const prev = await fetchFreshEvent(nostr, { kinds: [0], authors: [user.pubkey] }) ?? event ?? null;

      let data: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(prev?.content ?? '{}');
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>;
        }
      } catch { /* corrupt content — rebuild birthday onto an empty object */ }

      if (birthday) {
        data.birthday = birthday;
      } else {
        delete data.birthday;
      }

      const published = await publishEvent({ kind: 0, content: JSON.stringify(data), prev: prev ?? undefined });
      // Seed the author cache with the published event instead of
      // invalidating it — a refetch can race relay propagation and clobber
      // the cache with the old profile, blanking the birthday we just saved
      // (same pattern as EditProfileForm).
      queryClient.setQueryData(['author', user.pubkey], parseAuthorEvent(published));
      // Persist to the local event store too, so a full page refresh reseeds
      // the fresh profile from IndexedDB (via useCacheFirstSeed) instead of a
      // stale relay copy that hasn't caught up yet — otherwise the birthday
      // blanks out on reload.
      void store.event(published);
      queryClient.invalidateQueries({ queryKey: ['logins'] });
      toast({ title: birthday ? t('settings.profile.birthday.saved') : t('settings.profile.birthday.removed') });
    } catch {
      toast({ title: t('settings.profile.birthday.error'), description: t('settings.profile.birthday.errorDescription'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    if (isEmpty) {
      void publishBirthday(undefined);
      return;
    }
    const birthday: Birthday = {};
    if (yearNum !== undefined && !yearInvalid) birthday.year = yearNum;
    if (month !== undefined) birthday.month = month;
    if (day !== undefined) birthday.day = day;
    void publishBirthday(birthday);
  };

  const handleRemove = () => {
    setMonth(undefined);
    setDay(undefined);
    setYear('');
    void publishBirthday(undefined);
  };

  const dayCount = daysInMonth(month);

  const monthNames = MONTH_KEYS.map((key) => t(`settings.profile.birthday.months.${key}`));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-1">
        <Cake className="size-4 text-primary/70" />
        <h2 className="text-sm font-semibold">{t('settings.profile.birthday.title')}</h2>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t('settings.profile.birthday.description')}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={month !== undefined ? String(month) : ''}
          onValueChange={(v) => {
            // Radix's hidden native <select> (rendered because this sits
            // inside the profile <form>) can fire a spurious change with ''
            // when the controlled value is set programmatically before the
            // items register — Number('') is 0, which poisoned the state.
            // A real selection is never '' (Radix forbids empty item values).
            if (!v) return;
            const m = Number(v);
            setMonth(m);
            // Clamp the day if the new month is shorter (e.g. May 31 → June).
            if (day !== undefined && day > daysInMonth(m)) setDay(daysInMonth(m));
          }}
        >
          <SelectTrigger className="h-9 w-36" aria-label={t('settings.profile.birthday.monthAriaLabel')}>
            {/* Explicit children keep the trigger label a pure function of
                component state instead of Radix's internal item registration. */}
            <SelectValue placeholder={t('settings.profile.birthday.monthPlaceholder')}>
              {month !== undefined ? monthNames[month - 1] : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {monthNames.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>{name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={day !== undefined ? String(day) : ''}
          onValueChange={(v) => { if (v) setDay(Number(v)); }}
        >
          <SelectTrigger className="h-9 w-20" aria-label={t('settings.profile.birthday.dayAriaLabel')}>
            <SelectValue placeholder={t('settings.profile.birthday.dayPlaceholder')}>
              {day !== undefined ? String(day) : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: dayCount }, (_, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={year}
          onChange={(e) => setYear(e.target.value)}
          onBlur={() => setYearBlurred(true)}
          placeholder={t('settings.profile.birthday.yearPlaceholder')}
          inputMode="numeric"
          maxLength={4}
          className="h-9 w-32"
          aria-label={t('settings.profile.birthday.yearAriaLabel')}
          aria-invalid={showYearInvalid}
        />

        <Button
          type="button"
          size="sm"
          className="h-9 rounded-full px-4 font-bold"
          onClick={handleSave}
          disabled={!dirty || yearInvalid || saving || !user}
        >
          {saving ? <Loader2 className="size-3.5 animate-spin" /> : t('common.save')}
        </Button>

        {hasStored && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 text-destructive hover:text-destructive"
            onClick={handleRemove}
            disabled={saving}
            aria-label={t('settings.profile.birthday.removeAriaLabel')}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      {showYearInvalid && (
        <p className="text-xs text-destructive">
          {t('settings.profile.birthday.yearError', { year: currentYear })}
        </p>
      )}
    </div>
  );
}

// ── Backup Key section ────────────────────────────────────────────────────────

function BackupKeySection() {
  const { t } = useTranslation();
  const { logins } = useNostrLogin();
  const { config } = useAppContext();
  const { toast } = useToast();
  const current = logins[0];

  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const heading = (
    <div className="flex items-center gap-2 pb-1">
      <KeyRound className="size-4 text-primary/70" />
      <h2 className="text-sm font-semibold">{t('settings.profile.backupKey.title')}</h2>
    </div>
  );

  // Not applicable for extension / bunker logins — key isn't available in Ditto.
  if (!current) return null;

  if (current.type === 'extension') {
    return (
      <div>
        {heading}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('settings.profile.backupKey.extensionNote')}
        </p>
      </div>
    );
  }

  if (current.type === 'bunker') {
    return (
      <div>
        {heading}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('settings.profile.backupKey.bunkerNote', { appName: config.appName })}
        </p>
      </div>
    );
  }

  if (current.type !== 'nsec') {
    // Unknown future login type — don't guess.
    return null;
  }

  const nsec = current.data.nsec;
  const npub = nip19.npubEncode(current.pubkey);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(nsec);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({
        title: t('settings.profile.backupKey.copyFailed'),
        description: t('settings.profile.backupKey.copyFailedDescription'),
        variant: 'destructive',
      });
    }
  };

  const handleBackup = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const result = await saveNsec(npub, nsec, config.appName);
      if (result === 'saved-to-file') {
        toast({
          title: t('settings.profile.backupKey.saved'),
          description: t('settings.profile.backupKey.savedToFileDescription'),
        });
      } else if (result === 'saved') {
        toast({ title: t('settings.profile.backupKey.saved') });
      }
      // 'dismissed' is a deliberate user choice — no toast.
    } catch {
      toast({
        title: t('settings.profile.backupKey.saveFailed'),
        description: t('settings.profile.backupKey.saveFailedDescription'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {heading}
      <p className="text-xs text-muted-foreground leading-relaxed">
        {t('settings.profile.backupKey.description', { appName: config.appName })}
      </p>

      <div className="relative">
        <Input
          type={showKey ? 'text' : 'password'}
          value={nsec}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="pr-20 font-mono text-base md:text-sm"
          aria-label={t('settings.profile.backupKey.inputAriaLabel')}
        />
        <div className="absolute right-0 top-0 h-full flex items-center">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-full px-2 hover:bg-transparent"
            onClick={handleCopy}
            aria-label={t('settings.profile.backupKey.copyAriaLabel')}
          >
            {copied ? (
              <Check className="h-4 w-4 text-emerald-600" />
            ) : (
              <Copy className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-full px-2 hover:bg-transparent"
            onClick={() => setShowKey((v) => !v)}
            aria-label={showKey ? t('settings.profile.backupKey.hideAriaLabel') : t('settings.profile.backupKey.revealAriaLabel')}
          >
            {showKey ? (
              <EyeOff className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Eye className="h-4 w-4 text-muted-foreground" />
            )}
          </Button>
        </div>
      </div>

      {showKey && (
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg border border-amber-200 dark:border-amber-800 animate-in fade-in slide-in-from-top-1 duration-200">
          <p className="text-xs text-amber-900 dark:text-amber-300 leading-relaxed">
            {t('settings.profile.backupKey.warning')}
          </p>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="w-full gap-2 rounded-full h-12"
        onClick={handleBackup}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" /> {t('settings.profile.backupKey.saving')}
          </>
        ) : (
          <>
            <Download className="w-4 h-4" /> {t('settings.profile.backupKey.button')}
          </>
        )}
      </Button>
    </div>
  );
}
