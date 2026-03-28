import { FRAME_PRESETS, type FrameStyle } from '@/lib/letterTypes';
import { NoneFramePreview, EmojiFramePreview } from './FramePreviews';
import { Switch } from '@/components/ui/switch';

interface FramePickerProps {
  frame: FrameStyle;
  frameTint: boolean;
  onFrameSelect: (frame: FrameStyle) => void;
  onFrameTintChange: (tint: boolean) => void;
}

export function FramePicker({ frame, frameTint, onFrameSelect, onFrameTintChange }: FramePickerProps) {
  const hasFrame = frame !== 'none';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-2">
        {FRAME_PRESETS.map((fp) => {
          const isSelected = frame === fp.id;
          return (
            <button
              key={fp.id}
              onClick={() => onFrameSelect(fp.id)}
              title={fp.name}
              className={`aspect-square rounded-2xl overflow-hidden transition-all hover:scale-105 active:scale-95 ${
                isSelected ? 'scale-105 shadow-md' : 'opacity-70 hover:opacity-100'
              }`}
            >
              {fp.id === 'none' ? (
                <NoneFramePreview />
              ) : (
                <EmojiFramePreview frameId={fp.id} />
              )}
            </button>
          );
        })}
      </div>

      {hasFrame && (
        <div className="flex items-center justify-between px-1 pt-1">
          <span className="text-sm text-muted-foreground font-medium">match stationery color</span>
          <Switch checked={frameTint} onCheckedChange={onFrameTintChange} />
        </div>
      )}
    </div>
  );
}
