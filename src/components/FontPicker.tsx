import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Type } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { bundledFonts, loadBundledFont, resolveCssFamily, type FontCategory } from '@/lib/fonts';
import type { ThemeFont } from '@/themes';

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
 * Font picker component for selecting a single custom font.
 *
 * Supports two modes:
 * - **Uncontrolled** (default): reads/writes via `useTheme().applyCustomTheme()`
 * - **Controlled**: pass `value` and `onChange` props to manage state externally
 */
export function FontPicker({ value, onChange }: {
  /** Controlled value — overrides useTheme() when provided. */
  value?: ThemeFont | undefined;
  /** Controlled onChange — called instead of applyCustomTheme() when provided. */
  onChange?: (font: ThemeFont | undefined) => void;
} = {}) {
  const { theme, customTheme, applyCustomTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const controlled = onChange !== undefined;

  usePreloadFonts(open);

  const currentFont: ThemeFont | undefined = controlled
    ? value
    : (theme === 'custom' ? customTheme?.font : undefined);

  const handleSelect = (family: string) => {
    if (currentFont?.family === family) {
      // Deselect
      handleReset();
    } else if (controlled) {
      onChange({ family });
    } else {
      const currentColors = customTheme?.colors ?? {
        background: '228 20% 10%',
        text: '210 40% 98%',
        primary: '258 70% 60%',
      };
      applyCustomTheme({
        ...customTheme,
        colors: currentColors,
        font: { family },
      });
    }
    setOpen(false);
    setSearch('');
  };

  const handleReset = () => {
    if (controlled) {
      onChange(undefined);
      return;
    }
    if (!customTheme) return;
    applyCustomTheme({
      ...customTheme,
      font: undefined,
    });
  };

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Type className="size-3.5" />
        Font
      </span>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal h-9 text-sm"
            style={currentFont ? { fontFamily: `"${resolveCssFamily(currentFont.family)}", sans-serif` } : undefined}
          >
            {currentFont?.family ?? 'Default (Inter)'}
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {currentFont && (
        <p
          className="text-sm text-muted-foreground"
          style={{ fontFamily: `"${resolveCssFamily(currentFont.family)}", sans-serif` }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      )}
    </div>
  );
}
