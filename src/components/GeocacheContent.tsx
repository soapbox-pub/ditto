import { MapPin, Mountain, Brain, Package, Eye, EyeOff } from 'lucide-react';
import { useState, useMemo } from 'react';
import { ImageGallery } from '@/components/ImageGallery';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function getAllTags(tags: string[][], name: string): string[] {
  return tags.filter(([n]) => n === name).map(([, v]) => v);
}

/** Render difficulty/terrain pips (1-5). */
function DifficultyPips({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'size-2 rounded-full',
            i < value ? 'bg-primary' : 'bg-muted-foreground/25',
          )}
        />
      ))}
    </div>
  );
}

/** ROT13 decode for hints. */
function rot13(str: string): string {
  return str.replace(/[A-Za-z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

const SIZE_LABELS: Record<string, string> = {
  micro: 'Micro',
  small: 'Small',
  regular: 'Regular',
  large: 'Large',
  other: 'Other',
};

const TYPE_LABELS: Record<string, string> = {
  traditional: 'Traditional',
  multi: 'Multi-cache',
  mystery: 'Mystery',
};

export function GeocacheContent({ event }: { event: NostrEvent }) {
  const name = getTag(event.tags, 'name');
  const difficulty = Number(getTag(event.tags, 'D') ?? 1);
  const terrain = Number(getTag(event.tags, 'T') ?? 1);
  const size = getTag(event.tags, 'S') ?? 'other';
  const cacheType = getTag(event.tags, 't') ?? 'traditional';
  const hint = getTag(event.tags, 'hint');
  const images = getAllTags(event.tags, 'image').filter((url) => url.trim() !== '');
  const description = event.content;

  const [hintRevealed, setHintRevealed] = useState(false);

  // Decode hint with ROT13 when revealed
  const decodedHint = useMemo(() => (hint ? rot13(hint) : ''), [hint]);

  return (
    <div className="mt-2">
      {/* Cache name */}
      {name && (
        <div className="flex items-start gap-2 mb-2">
          <MapPin className="size-4 text-primary mt-0.5 shrink-0" />
          <span className="text-[15px] font-semibold leading-snug">{name}</span>
        </div>
      )}

      {/* Badges row: type, size */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
          {TYPE_LABELS[cacheType] ?? cacheType}
        </Badge>
        <Badge variant="secondary" className="text-[11px] gap-1 font-medium">
          <Package className="size-3" />
          {SIZE_LABELS[size] ?? size}
        </Badge>
      </div>

      {/* D/T ratings */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-2">
          <Brain className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">D</span>
          <DifficultyPips value={difficulty} />
          <span className="text-xs font-medium tabular-nums">{difficulty}</span>
        </div>
        <div className="flex items-center gap-2">
          <Mountain className="size-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground shrink-0">T</span>
          <DifficultyPips value={terrain} />
          <span className="text-xs font-medium tabular-nums">{terrain}</span>
        </div>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[15px] leading-relaxed text-foreground/90 line-clamp-4">
          {description}
        </p>
      )}

      {/* Images */}
      {images.length > 0 && (
        <ImageGallery images={images} />
      )}

      {/* Hint */}
      {hint && (
        <button
          onClick={(e) => { e.stopPropagation(); setHintRevealed(!hintRevealed); }}
          className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {hintRevealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {hintRevealed ? decodedHint : 'Show hint'}
        </button>
      )}
    </div>
  );
}
