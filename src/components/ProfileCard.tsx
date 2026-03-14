import React, { useMemo, useState } from 'react';
import type { NostrMetadata } from '@nostrify/nostrify';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { type AvatarShape, isValidAvatarShape, isEmoji, getEmojiMaskUrl } from '@/lib/avatarShape';
import { Camera, CheckCircle2, Pencil, Plus, Trash2, ChevronDown, ImagePlus, SmilePlus, X as XIcon } from 'lucide-react';
import { genUserName } from '@/lib/genUserName';
import { cn } from '@/lib/utils';
import { getNip05Domain, formatNip05Display } from '@/lib/nip05';
import { ExternalFavicon } from '@/components/ExternalFavicon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { EmojiPicker, type EmojiSelection } from '@/components/EmojiPicker';

/** Shared classes for all editable fields — static muted bg when idle, border on hover/focus */
const editableBase = [
  'rounded-lg px-2',
  'border-2 border-transparent',
  'bg-muted/40',
  'hover:bg-muted/60 hover:border-border',
  'focus:bg-transparent focus:border-primary',
  'transition-colors duration-150',
  'placeholder:text-muted-foreground/40',
  'outline-none',
].join(' ');

function EditableInput({
  value,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={cn(editableBase, 'w-full min-w-0 py-0.5', className)}
    />
  );
}

function EditableTextarea({
  value,
  placeholder,
  onChange,
  className,
}: {
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        onChange(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
      }}
      onFocus={(e) => {
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
      }}
      rows={1}
      className={cn(editableBase, 'w-full min-w-0 py-1 resize-none overflow-hidden text-sm text-muted-foreground leading-relaxed', className)}
    />
  );
}

export interface ProfileField {
  label: string;
  value: string;
}

export interface ProfileCardProps {
  pubkey?: string;
  metadata: Partial<NostrMetadata>;
  onChange?: (patch: Partial<NostrMetadata>) => void;
  onPickImage?: (field: 'picture' | 'banner') => void;
  /** Called when user picks an avatar shape (emoji string, or empty to clear). */
  onAvatarShape?: (shape: string) => void;
  /** Called when user removes their avatar picture. */
  onRemoveAvatar?: () => void;
  /** Show NIP-05 row (default true) */
  showNip05?: boolean;
  /** When provided, render an editable profile fields section below bio */
  extraFields?: ProfileField[];
  onExtraFieldsChange?: (fields: ProfileField[]) => void;
}

export function ProfileCard({
  pubkey,
  metadata,
  onChange,
  onPickImage,
  onAvatarShape,
  onRemoveAvatar,
  showNip05 = true,
  extraFields,
  onExtraFieldsChange,
}: ProfileCardProps) {
  const editable = !!onChange;
  const [nip05Focused, setNip05Focused] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  const displayName = metadata.display_name || metadata.name || genUserName(pubkey);
  const initial = displayName[0]?.toUpperCase() ?? '?';
  const patch = (key: keyof NostrMetadata) => (v: string) => onChange?.({ [key]: v });

  // Read shape from metadata (it's a custom property passed through the loose schema)
  const rawShape = metadata.shape;
  const shape: AvatarShape | undefined = isValidAvatarShape(rawShape) ? rawShape : undefined;
  const isEmojiShape = !!shape && isEmoji(shape);

  // Memoized mask style for the hover overlay on emoji-shaped avatars
  const overlayMaskStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (!isEmojiShape) return undefined;
    const maskUrl = getEmojiMaskUrl(shape);
    if (!maskUrl) return undefined;
    return {
      WebkitMaskImage: `url(${maskUrl})`,
      maskImage: `url(${maskUrl})`,
      WebkitMaskSize: 'contain',
      maskSize: 'contain' as string,
      WebkitMaskRepeat: 'no-repeat',
      maskRepeat: 'no-repeat' as string,
      WebkitMaskPosition: 'center',
      maskPosition: 'center' as string,
    };
  }, [isEmojiShape, shape]);

  const nip05 = metadata.nip05;
  const nip05Domain = nip05 ? getNip05Domain(nip05) : undefined;

  const addField = () => onExtraFieldsChange?.([...(extraFields ?? []), { label: '', value: '' }]);
  const removeField = (i: number) => onExtraFieldsChange?.((extraFields ?? []).filter((_, idx) => idx !== i));
  const updateField = (i: number, key: keyof ProfileField, val: string) =>
    onExtraFieldsChange?.((extraFields ?? []).map((f, idx) => idx === i ? { ...f, [key]: val } : f));

  return (
    <div className="bg-card border rounded-xl overflow-hidden">

      {/* Banner */}
      <div
        className={cn('relative h-36 bg-secondary', editable && 'cursor-pointer group')}
        style={
          metadata.banner
            ? { backgroundImage: `url(${metadata.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : undefined
        }
        onClick={() => editable && onPickImage?.('banner')}
      >
        {!metadata.banner && <div className="absolute inset-0 bg-gradient-to-br from-accent/10 via-transparent to-primary/5" />}
        {editable && !metadata.banner && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Plus className="size-6 text-muted-foreground" strokeWidth={4} />
          </div>
        )}
        {editable && (
          <>
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 text-white text-xs font-medium bg-black/50 rounded-full px-3 py-1.5 backdrop-blur-sm">
                <Camera className="size-3.5" /> {metadata.banner ? 'Change banner' : 'Add banner'}
              </span>
            </div>
            <div className="absolute bottom-2 right-2 size-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center group-hover:opacity-0 transition-opacity">
              <Pencil className="size-3.5 text-muted-foreground" />
            </div>
          </>
        )}
      </div>

      {/* Profile info */}
      <div className="px-4 pb-4">

        {/* Avatar */}
        <div className="flex justify-between items-start -mt-12 mb-3">
          {editable ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className="relative shrink-0 cursor-pointer group outline-none">
                    <Avatar shape={shape} className={cn("size-24 shadow-sm", isEmojiShape ? "ring-4 ring-background" : "border-4 border-background")}>
                      <AvatarImage src={metadata.picture} alt={displayName} className="object-cover" />
                      <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                        {metadata.picture ? initial : <Plus className="size-8 text-muted-foreground" strokeWidth={4} />}
                      </AvatarFallback>
                    </Avatar>
                    <div
                      className={cn(
                        'absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors flex items-center justify-center',
                        !isEmojiShape && 'rounded-full',
                      )}
                      style={overlayMaskStyle}
                    >
                      <Camera className="size-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                    </div>
                    <div className="absolute bottom-0 right-0 size-7 rounded-full bg-background border border-border shadow-sm flex items-center justify-center group-hover:opacity-0 transition-opacity">
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6}>
                  <DropdownMenuItem onClick={() => onPickImage?.('picture')}>
                    <ImagePlus className="size-4 mr-2" />
                    Change avatar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setEmojiPickerOpen(true)}>
                    <SmilePlus className="size-4 mr-2" />
                    Set avatar shape
                  </DropdownMenuItem>
                  {metadata.picture && (
                    <DropdownMenuItem onClick={() => onRemoveAvatar?.()} className="text-destructive focus:text-destructive">
                      <XIcon className="size-4 mr-2" />
                      Remove avatar
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog open={emojiPickerOpen} onOpenChange={setEmojiPickerOpen}>
                <DialogContent className="max-w-fit p-0 gap-0 overflow-hidden">
                  <DialogHeader className="px-6 pt-5 pb-3">
                    <DialogTitle className="text-base">Set avatar shape</DialogTitle>
                    <DialogDescription>Pick an emoji to mask your avatar</DialogDescription>
                  </DialogHeader>
                  <EmojiPicker onSelect={(selection: EmojiSelection) => {
                    if (selection.type === 'native') {
                      onAvatarShape?.(selection.emoji);
                      setEmojiPickerOpen(false);
                    }
                  }} />
                  {isEmojiShape && (
                    <div className="px-4 pb-4 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full text-destructive hover:text-destructive"
                        onClick={() => { onAvatarShape?.(''); setEmojiPickerOpen(false); }}
                      >
                        <XIcon className="size-3.5 mr-1.5" />
                        Remove avatar shape
                      </Button>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </>
          ) : (
            <div className="relative shrink-0">
              <Avatar shape={shape} className={cn("size-24 shadow-sm", isEmojiShape ? "ring-4 ring-background" : "border-4 border-background")}>
                <AvatarImage src={metadata.picture} alt={displayName} className="object-cover" />
                <AvatarFallback className="bg-primary/20 text-primary text-2xl font-bold">
                  {initial}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
        </div>

        {/* Name */}
        {editable ? (
          <EditableInput
            value={metadata.name ?? ''}
            placeholder="Your name"
            onChange={patch('name')}
            className="text-xl font-bold"
          />
        ) : (
          <h2 className="text-xl font-bold truncate">{displayName}</h2>
        )}

        {/* NIP-05 */}
        {showNip05 && (editable || nip05) && (
          <div className="flex items-center gap-1 mt-2 min-w-0 text-sm text-muted-foreground ml-2">
            <CheckCircle2 className="size-3.5 text-primary shrink-0" />
            {editable && nip05Focused ? (
              <input
                type="text"
                value={nip05 ?? ''}
                placeholder="you@domain.com"
                autoFocus
                onChange={(e) => patch('nip05')(e.target.value)}
                onBlur={() => setNip05Focused(false)}
                size={Math.max((nip05?.length ?? 0) + 1, 4)}
                className={cn(editableBase, 'py-0.5 h-6 text-sm text-muted-foreground border-primary bg-transparent')}
              />
            ) : (
              <span
                className={cn(
                  'inline-flex items-center gap-1 min-w-0',
                  editable && cn(editableBase, 'py-0.5 h-6 cursor-text'),
                )}
                onClick={() => editable && setNip05Focused(true)}
              >
                <span className="shrink min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {nip05 ? formatNip05Display(nip05) : editable ? 'you@domain.com' : ''}
                </span>
                {nip05Domain && (
                  <ExternalFavicon url={`https://${nip05Domain}`} size={14} className="shrink-0" />
                )}
              </span>
            )}
          </div>
        )}

        {/* Bio */}
        <div className="mt-2">
          {editable ? (
            <EditableTextarea
              value={metadata.about ?? ''}
              placeholder="Write a short bio…"
              onChange={patch('about')}
            />
          ) : metadata.about ? (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{metadata.about}</p>
          ) : null}
        </div>

        {/* Extra profile fields — collapsible, only when prop provided */}
        {extraFields !== undefined && (
          <Collapsible open={fieldsOpen} onOpenChange={setFieldsOpen} className="mt-3">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <Button type="button" variant="ghost" className="w-full justify-between px-0 h-auto hover:bg-transparent text-sm font-medium text-muted-foreground">
                  Profile Fields
                  <ChevronDown className="size-4 transition-transform duration-200 [[data-state=open]_&]:rotate-180" strokeWidth={4} />
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="space-y-2 pt-2">
              {/* Website always first */}
              <div className="grid grid-cols-[1fr,2fr] gap-2 items-center">
                <span className="text-sm text-muted-foreground px-1">Website</span>
                <Input
                  placeholder="https://yourwebsite.com"
                  value={(metadata.website as string) ?? ''}
                  onChange={(e) => patch('website')(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>

              {extraFields.map((field, i) => (
                <div key={i} className="grid grid-cols-[1fr,2fr,auto] gap-2 items-center">
                  <Input
                    placeholder="Label"
                    value={field.label}
                    onChange={(e) => updateField(i, 'label', e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Input
                    placeholder="Value or URL"
                    value={field.value}
                    onChange={(e) => updateField(i, 'value', e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeField(i)} className="h-8 w-8 text-destructive hover:text-destructive">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}

              <Button type="button" variant="outline" size="sm" onClick={addField} className="w-full h-8 text-xs">
                <Plus className="size-3 mr-1" strokeWidth={4} /> Add Field
              </Button>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
