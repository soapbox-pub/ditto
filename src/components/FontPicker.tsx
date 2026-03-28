import { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Type, Upload, Loader2, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { bundledFonts, findBundledFont, loadBundledFont, resolveCssFamily, type FontCategory } from '@/lib/fonts';
import { loadFont } from '@/lib/fontLoader';
import type { ThemeFont } from '@/themes';

/** Accepted font file extensions. */
const FONT_ACCEPT = '.woff2,.woff,.ttf,.otf';

/** Category labels for UI display */
const CATEGORY_LABELS: Record<FontCategory, string> = {
  sans: 'Sans Serif',
  serif: 'Serif',
  mono: 'Monospace',
  display: 'Display',
  handwriting: 'Handwriting',
};

/** Category display order */
const CATEGORY_ORDER: FontCategory[] = ['sans', 'serif', 'mono', 'display', 'handwriting'];

/** Fonts grouped by category for the picker. */
const fontsByCategory = CATEGORY_ORDER
  .map((cat) => ({
    category: cat,
    label: CATEGORY_LABELS[cat],
    fonts: bundledFonts.filter((f) => f.category === cat),
  }))
  .filter((g) => g.fonts.length > 0);

/** Preload all bundled fonts so they display in their own face in the picker. */
function usePreloadFonts(open: boolean) {
  useEffect(() => {
    if (!open) return;
    // Stagger loading to avoid a burst
    const timer = setTimeout(() => {
      for (const font of bundledFonts) {
        loadBundledFont(font.family);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [open]);
}

/**
 * Extract a human-readable font family name from a filename.
 * e.g. "MyCustomFont-Regular.woff2" → "MyCustomFont"
 *      "awesome_font.ttf" → "awesome font"
 */
function familyFromFilename(filename: string): string {
  // Remove extension
  const base = filename.replace(/\.(woff2?|ttf|otf)$/i, '');
  // Remove common weight/style suffixes
  const cleaned = base.replace(/[-_\s]?(Regular|Bold|Italic|Light|Medium|SemiBold|ExtraBold|Thin|Black|Variable|VF)$/i, '');
  // Replace hyphens/underscores with spaces
  return cleaned.replace(/[-_]/g, ' ').trim() || base;
}

/**
 * Bare font picker combobox — no section header, no preview text.
 *
 * Supports two modes:
 * - **Uncontrolled** (default): reads/writes the body font via `useTheme().applyCustomTheme()`
 * - **Controlled**: pass `value` and `onChange` props to manage state externally
 *
 * Also supports uploading a custom font file via Blossom.
 */
export function FontPicker({ value, onChange, placeholder = 'Default (Inter)', placeholderFont }: {
  /** Controlled value — overrides useTheme() when provided. */
  value?: ThemeFont | undefined;
  /** Controlled onChange — called instead of applyCustomTheme() when provided. */
  onChange?: (font: ThemeFont | undefined) => void;
  /** Text shown when no font is selected. Defaults to "Default (Inter)". */
  placeholder?: string;
  /** Font to render the placeholder text in (when no value is selected). */
  placeholderFont?: ThemeFont | undefined;
} = {}) {
  const { theme, customTheme, applyCustomTheme } = useTheme();
  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controlled = onChange !== undefined;

  usePreloadFonts(open);

  const currentFont: ThemeFont | undefined = controlled
    ? value
    : (theme === 'custom' ? customTheme?.font : undefined);

  /** Whether the current font is a custom upload (has a URL and is not bundled). */
  const isCustomUpload = currentFont?.url && !findBundledFont(currentFont.family);

  const applyFont = (font: ThemeFont | undefined) => {
    if (controlled) {
      onChange(font);
    } else {
      const currentColors = customTheme?.colors ?? {
        background: '228 20% 10%',
        text: '210 40% 98%',
        primary: '258 70% 60%',
      };
      applyCustomTheme({
        ...customTheme,
        colors: currentColors,
        font,
      });
    }
  };

  const handleSelect = (family: string) => {
    if (currentFont?.family === family) {
      // Deselect
      handleReset();
    } else {
      applyFont({ family });
    }
    setOpen(false);
    setSearch('');
  };

  const handleReset = () => {
    applyFont(undefined);
  };

  /** Handle custom font file upload. */
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Validate file type
    const validExtensions = ['.woff2', '.woff', '.ttf', '.otf'];
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(ext)) {
      toast({ title: 'Invalid file', description: 'Please select a .woff2, .woff, .ttf, or .otf font file.', variant: 'destructive' });
      return;
    }

    try {
      const tags = await uploadFile(file);
      const url = tags[0][1];
      const family = familyFromFilename(file.name);

      // Load and inject the font so it's immediately visible
      await loadFont(family, url);

      applyFont({ family, url });
      setOpen(false);
      setSearch('');

      toast({ title: 'Font uploaded', description: `"${family}" is now active.` });
    } catch (error) {
      console.error('Failed to upload font:', error);
      toast({ title: 'Upload failed', description: 'Could not upload the font file.', variant: 'destructive' });
    }
  };

  /** Trigger the hidden file input from within the command list. */
  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9 text-sm"
            style={currentFont
              ? { fontFamily: `"${resolveCssFamily(currentFont.family)}", sans-serif` }
              : placeholderFont
                ? { fontFamily: `"${resolveCssFamily(placeholderFont.family)}", sans-serif` }
                : undefined
            }
          >
            <span className="truncate">
              {currentFont?.family ?? placeholder}
              {isCustomUpload && (
                <span className="ml-1.5 text-muted-foreground text-xs">(uploaded)</span>
              )}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0 overflow-hidden" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
          <Command shouldFilter={true}>
            <CommandInput
              placeholder="Search fonts..."
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>
                <span className="text-muted-foreground">No matching fonts</span>
              </CommandEmpty>

              {/* Custom uploaded font (shown at top when active) */}
              {isCustomUpload && currentFont && (
                <CommandGroup heading="Custom">
                  <CommandItem
                    value={currentFont.family}
                    onSelect={() => handleSelect(currentFont.family)}
                    style={{ fontFamily: `"${currentFont.family}", sans-serif` }}
                  >
                    <Check className="mr-2 size-4 opacity-100" />
                    <span className="flex-1 truncate">{currentFont.family}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReset();
                        setOpen(false);
                      }}
                      className="ml-2 p-0.5 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Remove custom font"
                    >
                      <X className="size-3.5" />
                    </button>
                  </CommandItem>
                </CommandGroup>
              )}

              {fontsByCategory.map((group) => (
                <CommandGroup key={group.category} heading={group.label}>
                  {group.fonts.map((font) => (
                    <CommandItem
                      key={font.family}
                      value={font.family}
                      onSelect={() => handleSelect(font.family)}
                      style={{ fontFamily: `"${font.cssFamily}", sans-serif` }}
                    >
                      <Check
                        className={cn(
                          'mr-2 size-4',
                          currentFont?.family === font.family ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {font.family}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {/* Upload custom font option */}
              {user && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      value="__upload_custom_font__"
                      onSelect={handleUploadClick}
                      disabled={isUploading}
                      className="text-muted-foreground"
                    >
                      {isUploading ? (
                        <Loader2 className="mr-2 size-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 size-4" />
                      )}
                      {isUploading ? 'Uploading...' : 'Upload custom font...'}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Hidden file input for font upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept={FONT_ACCEPT}
        className="hidden"
        onChange={handleFileUpload}
      />
    </>
  );
}

/**
 * Unified font section with body + title pickers and a live preview.
 *
 * Shows a single "Fonts" header, two labeled rows (Body / Title),
 * and a combined preview showing both fonts in context.
 */
export function FontSection({ bodyFont, onBodyFontChange, titleFont, onTitleFontChange }: {
  bodyFont?: ThemeFont | undefined;
  onBodyFontChange?: (font: ThemeFont | undefined) => void;
  titleFont?: ThemeFont | undefined;
  onTitleFontChange?: (font: ThemeFont | undefined) => void;
}) {
  return (
    <div className="space-y-3">
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Type className="size-3.5" />
        Fonts
      </span>

      {/* Two-row picker layout */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Title</span>
          <div className="flex-1">
            <FontPicker value={titleFont} onChange={onTitleFontChange} placeholder={bodyFont?.family ?? 'Default (Inter)'} placeholderFont={bodyFont} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Body</span>
          <div className="flex-1">
            <FontPicker value={bodyFont} onChange={onBodyFontChange} />
          </div>
        </div>
      </div>
    </div>
  );
}
