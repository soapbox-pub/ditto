import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, RotateCcw, Type } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { bundledFonts, loadBundledFont, type FontCategory } from '@/lib/fonts';
import type { ThemeFont, ThemeFonts } from '@/themes';

type FontRole = 'title' | 'body';

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

/** Single-role font picker (title or body). */
function RolePicker({ label, value, onChange }: {
  label: string;
  value: ThemeFont | undefined;
  onChange: (font: ThemeFont | undefined) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  usePreloadFonts(open);

  const handleSelect = (family: string) => {
    if (value?.family === family) {
      onChange(undefined);
    } else {
      onChange({ family });
    }
    setOpen(false);
    setSearch('');
  };

  const handleReset = () => {
    onChange(undefined);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
          >
            <RotateCcw className="size-3" />
            Reset
          </Button>
        )}
      </div>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9 text-sm"
            style={value ? { fontFamily: `"${value.family}", sans-serif` } : undefined}
          >
            {value?.family ?? 'Default (Inter)'}
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
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

              {fontsByCategory.map((group) => (
                <CommandGroup key={group.category} heading={group.label}>
                  {group.fonts.map((font) => (
                    <CommandItem
                      key={font.family}
                      value={font.family}
                      onSelect={() => handleSelect(font.family)}
                      style={{ fontFamily: `"${font.family}", sans-serif` }}
                    >
                      <Check
                        className={cn(
                          'mr-2 size-4',
                          value?.family === font.family ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      {font.family}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value && (
        <p
          className="text-sm text-muted-foreground"
          style={{ fontFamily: `"${value.family}", sans-serif` }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      )}
    </div>
  );
}

/**
 * Font picker component with separate title/body selections.
 * Integrates with the theme system via useTheme().applyCustomTheme().
 */
export function FontPicker() {
  const { customTheme, applyCustomTheme } = useTheme();

  /** Current fonts from the custom theme, if any. */
  const currentFonts: ThemeFonts | undefined = customTheme?.fonts;

  const handleFontChange = (role: FontRole, font: ThemeFont | undefined) => {
    const currentColors = customTheme?.colors ?? {
      background: '228 20% 10%',
      text: '210 40% 98%',
      primary: '258 70% 60%',
    };

    const newFonts: ThemeFonts = {
      ...currentFonts,
      [role]: font,
    };

    // Clean up: if both roles are undefined, don't store empty fonts object
    const hasFonts = newFonts.title || newFonts.body;

    applyCustomTheme({
      ...customTheme,
      colors: currentColors,
      fonts: hasFonts ? newFonts : undefined,
    });
  };

  const hasAnyFont = currentFonts?.title || currentFonts?.body;

  const handleResetAll = () => {
    if (!customTheme) return;
    applyCustomTheme({
      ...customTheme,
      fonts: undefined,
    });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 flex items-center gap-2">
          <Type className="size-3.5" />
          Fonts
        </h3>
        {hasAnyFont && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetAll}
            className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground px-2"
          >
            <RotateCcw className="size-3" />
            Reset all
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <RolePicker
          label="Heading Font"
          value={currentFonts?.title}
          onChange={(font) => handleFontChange('title', font)}
        />
        <RolePicker
          label="Body Font"
          value={currentFonts?.body}
          onChange={(font) => handleFontChange('body', font)}
        />
      </div>
    </div>
  );
}
