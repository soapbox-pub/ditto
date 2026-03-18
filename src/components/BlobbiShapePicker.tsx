import { useState, useLayoutEffect } from 'react';
import { cn } from '@/lib/utils';
import { BLOBBI_SHAPES, type BlobbiShape, toBlobbiShapeValue } from '@/lib/blobbiShapes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface BlobbiShapePickerProps {
  /** Called when a shape is selected */
  onSelect: (shapeValue: string) => void;
  /** Optional className for the container */
  className?: string;
}

/** Cache for computed tight viewBoxes */
const viewBoxCache = new Map<string, string>();

/**
 * Compute a tight viewBox for a shape's SVG content synchronously.
 * Works with any SVG elements (circles, ellipses, paths, rects, etc.)
 */
function getTightViewBox(shape: BlobbiShape): string {
  const cached = viewBoxCache.get(shape.id);
  if (cached) return cached;

  // Create a temporary SVG to measure the group's bounding box
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', shape.viewBox);
  svg.style.position = 'absolute';
  svg.style.visibility = 'hidden';
  svg.style.width = '200px';
  svg.style.height = '200px';

  // Create a group to hold all shape elements
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.innerHTML = shape.svg;
  svg.appendChild(group);
  document.body.appendChild(svg);

  const bbox = group.getBBox();
  document.body.removeChild(svg);

  // Add minimal padding (2% of the larger dimension)
  const padding = Math.max(bbox.width, bbox.height) * 0.02;
  const tightViewBox = `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`;

  viewBoxCache.set(shape.id, tightViewBox);
  return tightViewBox;
}

/**
 * Renders a preview of a Blobbi shape with tight bounds for maximum visibility.
 * Uses useLayoutEffect to compute the tight viewBox before paint.
 * Supports all SVG elements including circles, ellipses, paths, rects, and transforms.
 */
function ShapePreview({ shape }: { shape: BlobbiShape }) {
  // Start with cached value if available, otherwise original viewBox
  const [viewBox, setViewBox] = useState<string>(() => {
    return viewBoxCache.get(shape.id) || shape.viewBox;
  });

  // Compute tight viewBox synchronously before browser paint
  useLayoutEffect(() => {
    const tight = getTightViewBox(shape);
    setViewBox(tight);
  }, [shape]);

  // Build inline style to colorize all elements
  const fillColor = shape.previewColor || '#a1a1aa';

  return (
    <svg
      viewBox={viewBox}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <style>{`* { fill: ${fillColor}; stroke: ${fillColor}; }`}</style>
      <g dangerouslySetInnerHTML={{ __html: shape.svg }} />
    </svg>
  );
}

/**
 * Grid of selectable Blobbi shapes
 * Uses 5 columns for larger, more prominent shapes (~1.5x emoji size)
 */
function ShapeGrid({
  shapes,
  onSelect,
}: {
  shapes: BlobbiShape[];
  onSelect: (shape: BlobbiShape) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {shapes.map((shape) => (
        <button
          key={shape.id}
          type="button"
          onClick={() => onSelect(shape)}
          className={cn(
            'relative aspect-square rounded-lg overflow-hidden',
            'bg-muted/50 hover:bg-muted transition-colors',
            'border-2 border-transparent hover:border-primary/50',
            'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
            'group'
          )}
          title={shape.name}
        >
          <div className="absolute inset-1">
            <ShapePreview shape={shape} />
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * Blobbi shape picker with tabs for different categories.
 * Allows users to select a Blobbi silhouette as their avatar mask.
 * Uses 5-column grid for prominent, easily recognizable shapes.
 */
export function BlobbiShapePicker({ onSelect, className }: BlobbiShapePickerProps) {
  const [activeTab, setActiveTab] = useState<string>('all');

  const handleSelect = (shape: BlobbiShape) => {
    onSelect(toBlobbiShapeValue(shape.id));
  };

  // Group shapes by category
  const eggShapes = BLOBBI_SHAPES.filter((s) => s.category === 'egg');
  const babyShapes = BLOBBI_SHAPES.filter((s) => s.category === 'baby');
  const adultShapes = BLOBBI_SHAPES.filter((s) => s.category === 'adult');

  return (
    <div className={cn('w-full', className)}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full grid grid-cols-4 mb-2">
          <TabsTrigger value="all" className="text-xs px-2">All</TabsTrigger>
          <TabsTrigger value="egg" className="text-xs px-2">Egg</TabsTrigger>
          <TabsTrigger value="baby" className="text-xs px-2">Baby</TabsTrigger>
          <TabsTrigger value="adult" className="text-xs px-2">Adult</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0">
          <ShapeGrid shapes={BLOBBI_SHAPES} onSelect={handleSelect} />
        </TabsContent>

        <TabsContent value="egg" className="mt-0">
          <ShapeGrid shapes={eggShapes} onSelect={handleSelect} />
        </TabsContent>

        <TabsContent value="baby" className="mt-0">
          <ShapeGrid shapes={babyShapes} onSelect={handleSelect} />
        </TabsContent>

        <TabsContent value="adult" className="mt-0">
          <ShapeGrid shapes={adultShapes} onSelect={handleSelect} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
