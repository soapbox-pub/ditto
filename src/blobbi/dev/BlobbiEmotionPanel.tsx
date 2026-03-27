/**
 * BlobbiEmotionPanel
 * 
 * DEV-ONLY panel for testing Blobbi emotions.
 * Allows selecting different emotions to preview how they look.
 */

import { Theater } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useEmotionDev } from './EmotionDevContext';
import type { BlobbiEmotion } from '@/blobbi/ui/lib/emotions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BlobbiEmotionPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Emotion Options ──────────────────────────────────────────────────────────

/**
 * Emotion options for the dev panel.
 * 
 * NOTE: The base/default Blobbi expression is visually "happy" (smiling mouth).
 * The 'neutral' internal key keeps this default - we label it "Default (Happy)"
 * in the UI to accurately reflect what the user sees.
 */
const EMOTIONS: Array<{ value: BlobbiEmotion; label: string; emoji: string }> = [
  { value: 'neutral', label: 'Default', emoji: '😊' },
  { value: 'sad', label: 'Sad', emoji: '😢' },
  { value: 'happy', label: 'Extra Happy', emoji: '😄' },
  { value: 'angry', label: 'Angry', emoji: '😠' },
  { value: 'surprised', label: 'Surprised', emoji: '😲' },
  { value: 'curious', label: 'Curious', emoji: '🤔' },
  { value: 'sleepy', label: 'Sleepy', emoji: '😴' },
  { value: 'dizzy', label: 'Dizzy', emoji: '😵' },
  { value: 'excited', label: 'Excited A', emoji: '🤩' },
  { value: 'excitedB', label: 'Excited B', emoji: '⭐' },
  { value: 'mischievous', label: 'Mischievous', emoji: '😏' },
  { value: 'adoring', label: 'Adoring', emoji: '🥺' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function BlobbiEmotionPanel({ isOpen, onClose }: BlobbiEmotionPanelProps) {
  const { devEmotion, setDevEmotion, clearDevEmotion } = useEmotionDev();
  
  // Don't render in production
  if (!import.meta.env.DEV) {
    return null;
  }
  
  const handleSelectEmotion = (emotion: BlobbiEmotion) => {
    if (emotion === 'neutral') {
      clearDevEmotion();
    } else {
      setDevEmotion(emotion);
    }
  };
  
  const currentEmotion = devEmotion ?? 'neutral';
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Theater className="size-5 text-amber-500" />
            <span className="text-amber-600 dark:text-amber-400">Dev: Emotion Tester</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Select an emotion to preview how it looks on your Blobbi.
            The default expression is already happy-looking (smiling).
            This is a dev-only tool and doesn't affect real state.
          </p>
          
          <div className="grid grid-cols-3 gap-2">
            {EMOTIONS.map(({ value, label, emoji }) => (
              <Button
                key={value}
                variant={currentEmotion === value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleSelectEmotion(value)}
                className={cn(
                  'flex flex-col items-center gap-1 h-auto py-3',
                  currentEmotion === value && 'ring-2 ring-amber-500/50'
                )}
              >
                <span className="text-xl">{emoji}</span>
                <span className="text-xs">{label}</span>
              </Button>
            ))}
          </div>
          
          {devEmotion && (
            <div className="pt-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDevEmotion}
                className="w-full text-muted-foreground"
              >
                Reset to Default (Happy)
              </Button>
            </div>
          )}
          
          <div className="text-xs text-muted-foreground/70 bg-muted/50 rounded-md p-2">
            <strong>Note:</strong> This panel is only visible in development mode.
            The emotion override applies to the dashboard Blobbi and the floating companion.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
