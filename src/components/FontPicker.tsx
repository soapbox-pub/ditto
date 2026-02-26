import { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, RotateCcw, Type } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useGoogleFont } from '@/hooks/useGoogleFont';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/**
 * A curated list of popular Google Fonts, spanning a variety of styles.
 * Users can also type any Google Font name manually.
 */
const POPULAR_FONTS = [
  // Sans-serif
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Nunito',
  'Raleway',
  'Outfit',
  'Manrope',
  'Work Sans',
  'DM Sans',
  'Source Sans 3',
  'Noto Sans',
  'Figtree',
  'Plus Jakarta Sans',
  'Geist',
  'Lexend',
  'Onest',
  'Sora',
  // Serif
  'Merriweather',
  'Playfair Display',
  'Lora',
  'PT Serif',
  'Noto Serif',
  'Source Serif 4',
  'Crimson Text',
  'Libre Baskerville',
  'EB Garamond',
  'Cormorant Garamond',
  // Monospace
  'JetBrains Mono',
  'Fira Code',
  'Source Code Pro',
  'IBM Plex Mono',
  'Space Mono',
  // Display / Fun
  'Pacifico',
  'Caveat',
  'Comfortaa',
  'Fredoka',
  'Quicksand',
  'Righteous',
  'Archivo Black',
  'Bebas Neue',
  'Concert One',
  'Titan One',
] as const;

/** Load a font into the browser for preview purposes (does not apply it site-wide). */
function preloadFont(family: string): void {
  const id = `font-preview-${family.replace(/\s/g, '-').toLowerCase()}`;
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@400;700&display=swap`;
  document.head.appendChild(link);
}

export function FontPicker() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { fontFamily, setFont } = useGoogleFont();
  const preloadedRef = useRef(new Set<string>());

  // Preload visible fonts for preview when the popover opens
  useEffect(() => {
    if (!open) return;

    // Preload the first batch immediately
    for (const font of POPULAR_FONTS.slice(0, 10)) {
      if (!preloadedRef.current.has(font)) {
        preloadFont(font);
        preloadedRef.current.add(font);
      }
    }

    // Preload the rest after a short delay
    const timer = setTimeout(() => {
      for (const font of POPULAR_FONTS) {
        if (!preloadedRef.current.has(font)) {
          preloadFont(font);
          preloadedRef.current.add(font);
        }
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [open]);

  // Also preload any custom search term for preview
  useEffect(() => {
    if (search.length >= 3 && !POPULAR_FONTS.some((f) => f.toLowerCase() === search.toLowerCase())) {
      const timer = setTimeout(() => {
        preloadFont(search);
        preloadedRef.current.add(search);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [search]);

  const handleSelect = (value: string) => {
    // If already selected, deselect
    if (value.toLowerCase() === fontFamily?.toLowerCase()) {
      setFont(null);
    } else {
      setFont(value);
    }
    setOpen(false);
    setSearch('');
  };

  const handleReset = () => {
    setFont(null);
  };

  // Check if the search term could be a custom font not in the list
  const trimmedSearch = search.trim();
  const isCustomSearch =
    trimmedSearch.length >= 2 &&
    !POPULAR_FONTS.some((f) => f.toLowerCase() === trimmedSearch.toLowerCase());

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Type className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Custom Font</span>
        </div>
        {fontFamily && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
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
            className="w-full justify-between font-normal"
            style={fontFamily ? { fontFamily: `"${fontFamily}", sans-serif` } : undefined}
          >
            {fontFamily ?? 'Default (Inter)'}
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
                {trimmedSearch.length >= 2 ? (
                  <span className="text-muted-foreground">No matches in the list.</span>
                ) : (
                  <span className="text-muted-foreground">Type to search...</span>
                )}
              </CommandEmpty>

              {/* Custom font entry from search */}
              {isCustomSearch && (
                <CommandGroup heading="Use custom font">
                  <CommandItem
                    value={trimmedSearch}
                    onSelect={handleSelect}
                    style={{ fontFamily: `"${trimmedSearch}", sans-serif` }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        fontFamily?.toLowerCase() === trimmedSearch.toLowerCase() ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {trimmedSearch}
                  </CommandItem>
                </CommandGroup>
              )}

              <CommandGroup heading="Popular fonts">
                {POPULAR_FONTS.map((font) => (
                  <CommandItem
                    key={font}
                    value={font}
                    onSelect={handleSelect}
                    style={{ fontFamily: `"${font}", sans-serif` }}
                  >
                    <Check
                      className={cn(
                        'mr-2 size-4',
                        fontFamily?.toLowerCase() === font.toLowerCase() ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {font}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {fontFamily && (
        <p
          className="text-sm text-muted-foreground"
          style={{ fontFamily: `"${fontFamily}", sans-serif` }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      )}
    </div>
  );
}
