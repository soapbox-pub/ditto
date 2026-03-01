import { useCallback, useRef, useEffect, useState } from 'react';
import { Search, X, ImageOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useGifSearch, type GifResult } from '@/hooks/useGifSearch';
import { cn } from '@/lib/utils';

interface GifPickerProps {
  onSelect: (gif: GifResult) => void;
}

/** A single GIF thumbnail with lazy loading and hover animation. */
function GifThumbnail({ gif, onClick }: { gif: GifResult; onClick: (gif: GifResult) => void }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Calculate the aspect ratio for the thumbnail to prevent layout shifts
  const aspectRatio = gif.width && gif.height ? gif.width / gif.height : 1;
  const displayHeight = Math.round(150 / aspectRatio);

  return (
    <button
      type="button"
      onClick={() => onClick(gif)}
      className={cn(
        'relative w-full rounded-lg overflow-hidden cursor-pointer',
        'transition-all duration-200 hover:ring-2 hover:ring-primary/60 hover:scale-[1.02]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
        'group',
      )}
      style={{ height: displayHeight }}
      title={gif.title}
    >
      {/* Skeleton placeholder */}
      {!loaded && !error && (
        <Skeleton className="absolute inset-0 rounded-lg" />
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted rounded-lg">
          <ImageOff className="size-5 text-muted-foreground/40" />
        </div>
      )}

      {/* GIF image */}
      <img
        ref={imgRef}
        src={gif.previewUrl}
        alt={gif.title}
        loading="lazy"
        className={cn(
          'w-full h-full object-cover rounded-lg transition-opacity duration-200',
          loaded ? 'opacity-100' : 'opacity-0',
        )}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />

      {/* Hover overlay with title */}
      <div className={cn(
        'absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent',
        'px-2 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150',
      )}>
        <span className="text-[10px] text-white line-clamp-1 font-medium">
          {gif.title}
        </span>
      </div>
    </button>
  );
}

/** Masonry-style two-column grid for GIF results. */
function GifGrid({ results, onSelect }: { results: GifResult[]; onSelect: (gif: GifResult) => void }) {
  // Split results into two columns for a masonry-like layout
  const columns: [GifResult[], GifResult[]] = [[], []];
  const columnHeights = [0, 0];

  for (const gif of results) {
    const aspectRatio = gif.width && gif.height ? gif.width / gif.height : 1;
    const height = Math.round(150 / aspectRatio);
    
    // Add to the shorter column
    const shorter = columnHeights[0] <= columnHeights[1] ? 0 : 1;
    columns[shorter].push(gif);
    columnHeights[shorter] += height + 8; // 8px gap
  }

  return (
    <div className="flex gap-2 px-2 pb-2">
      {columns.map((col, colIdx) => (
        <div key={colIdx} className="flex-1 flex flex-col gap-2">
          {col.map((gif) => (
            <GifThumbnail key={gif.id} gif={gif} onClick={onSelect} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function GifPicker({ onSelect }: GifPickerProps) {
  const { query, setQuery, clearQuery, results, isLoading, isError, isSearching } = useGifSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSelect = useCallback((gif: GifResult) => {
    onSelect(gif);
  }, [onSelect]);

  return (
    <div className="flex flex-col w-[340px] h-[420px] bg-popover rounded-lg overflow-hidden">
      {/* Search input */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="pl-8 pr-8 h-9 text-sm bg-muted/50 border-0 rounded-lg"
          />
          {query && (
            <button
              type="button"
              onClick={clearQuery}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Section header */}
      <div className="px-3 pb-1.5">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
          {isSearching ? 'Results' : 'Trending'}
        </span>
      </div>

      {/* Results area */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="px-2 pb-2">
            <div className="flex gap-2">
              {[0, 1].map((col) => (
                <div key={col} className="flex-1 flex flex-col gap-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="w-full rounded-lg"
                      style={{ height: 80 + Math.random() * 60 }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <ImageOff className="size-8 mb-2 opacity-40" />
            <p className="text-sm">Failed to load GIFs</p>
            <p className="text-xs mt-1">Please try again</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <p className="text-sm">No GIFs found</p>
            <p className="text-xs mt-1">Try a different search term</p>
          </div>
        ) : (
          <GifGrid results={results} onSelect={handleSelect} />
        )}
      </ScrollArea>

      {/* Tenor attribution */}
      <div className="px-3 py-1.5 border-t border-border/50 flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-muted-foreground/60">Powered by</span>
        <TenorLogo />
      </div>
    </div>
  );
}

/** Tenor brand wordmark for required attribution. */
function TenorLogo() {
  return (
    <svg width="42" height="12" viewBox="0 0 42 12" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-40">
      <text x="0" y="10" fontSize="10" fontWeight="600" fontFamily="system-ui, -apple-system, sans-serif" className="fill-muted-foreground">
        Tenor
      </text>
    </svg>
  );
}
