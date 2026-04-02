import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface LinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedText?: string;
  onSubmit: (text: string, url: string) => void;
}

export function LinkDialog({ open, onOpenChange, selectedText, onSubmit }: LinkDialogProps) {
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setText(selectedText || '');
      setUrl('');
    }
  }, [open, selectedText]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      const finalText = text.trim() || url.trim();
      let finalUrl = url.trim();

      // Add https:// if no protocol specified
      if (!/^https?:\/\//i.test(finalUrl)) {
        finalUrl = 'https://' + finalUrl;
      }

      onSubmit(finalText, finalUrl);
      onOpenChange(false);
    }
  };

  const hasSelectedText = !!selectedText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Insert Link</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {!hasSelectedText && (
              <div className="space-y-2">
                <Label htmlFor="link-text">Link Text</Label>
                <Input
                  id="link-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Enter link text..."
                  autoFocus={!hasSelectedText}
                />
              </div>
            )}
            {hasSelectedText && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Link Text</Label>
                <p className="text-sm bg-muted px-3 py-2 rounded-md">{selectedText}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                autoFocus={hasSelectedText}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!url.trim()}>
              Insert Link
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
