import { useState } from 'react';
import { cn } from '@/lib/utils';
import { BLOBBI_SHAPES, type BlobbiShape, toBlobbiShapeValue } from '@/lib/blobbiShapes';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export interface BlobbiShapePickerProps {
  /** Called when a shape is selected */
  onSelect: (shapeValue: string) => void;
  /** Optional className for the container */
  className?: string;
}

/**
 * Renders a preview of a Blobbi shape
 */
function ShapePreview({ shape }: { shape: BlobbiShape }) {
  return (
    <svg viewBox={shape.viewBox} className="w-full h-full">
      <path d={shape.path} fill={shape.previewColor || '#a1a1aa'} />
    </svg>
  );
}

/**
 * Grid of selectable Blobbi shapes
 */
function ShapeGrid({
  shapes,
  onSelect,
}: {
  shapes: BlobbiShape[];
  onSelect: (shape: BlobbiShape) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2 p-2">
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
          <div className="absolute inset-2">
            <ShapePreview shape={shape} />
          </div>
          <span className="absolute bottom-0.5 left-0 right-0 text-[10px] text-muted-foreground text-center opacity-0 group-hover:opacity-100 transition-opacity truncate px-1">
            {shape.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * Blobbi shape picker with tabs for different categories.
 * Allows users to select a Blobbi silhouette as their avatar mask.
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
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="egg">Egg</TabsTrigger>
          <TabsTrigger value="baby">Baby</TabsTrigger>
          <TabsTrigger value="adult">Adult</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-2">
          <ShapeGrid shapes={BLOBBI_SHAPES} onSelect={handleSelect} />
        </TabsContent>

        <TabsContent value="egg" className="mt-2">
          <ShapeGrid shapes={eggShapes} onSelect={handleSelect} />
        </TabsContent>

        <TabsContent value="baby" className="mt-2">
          <ShapeGrid shapes={babyShapes} onSelect={handleSelect} />
        </TabsContent>

        <TabsContent value="adult" className="mt-2">
          <ShapeGrid shapes={adultShapes} onSelect={handleSelect} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
