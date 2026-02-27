import { useState, useCallback, useRef } from 'react';
import { Blocks, Upload, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useQueryClient } from '@tanstack/react-query';
import { extractWebxdcMeta } from '@/lib/webxdcMeta';
import { toast } from '@/hooks/useToast';

interface WebxdcUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WebxdcUploadDialog({ open, onOpenChange }: WebxdcUploadDialogProps) {
  const { user } = useCurrentUser();
  const { mutateAsync: uploadFile } = useUploadFile();
  const { mutateAsync: createEvent } = useNostrPublish();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [appName, setAppName] = useState<string | undefined>();
  const [iconUrl, setIconUrl] = useState<string | undefined>();
  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);

  const reset = useCallback(() => {
    setFile(null);
    setDescription('');
    setAppName(undefined);
    setIconUrl(undefined);
    setIsUploading(false);
    setIsExtracting(false);
  }, []);

  const handleOpenChange = useCallback((next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  }, [onOpenChange, reset]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setIsExtracting(true);

    try {
      const meta = await extractWebxdcMeta(selected);
      setAppName(meta.name);

      // Upload icon if present
      if (meta.iconFile) {
        try {
          const iconTags = await uploadFile(meta.iconFile);
          const [[, url]] = iconTags;
          setIconUrl(url);
        } catch {
          // Icon upload failed, continue without it
        }
      }
    } catch {
      // Metadata extraction failed, continue without it
    } finally {
      setIsExtracting(false);
    }
  }, [uploadFile]);

  const handleSubmit = useCallback(async () => {
    if (!file || !user) return;

    setIsUploading(true);

    try {
      // Re-wrap with correct MIME type (browsers don't know .xdc)
      const uploadableFile = !file.type
        ? new File([file], file.name, { type: 'application/x-webxdc' })
        : file;

      const uploadTags = await uploadFile(uploadableFile);
      let [[, url]] = uploadTags;

      // Ensure URL ends with .xdc
      if (!url.endsWith('.xdc')) {
        url = url + '.xdc';
      }

      // Build the kind 1063 tags
      const tags: string[][] = [
        ['url', url],
        ['m', 'application/x-webxdc'],
      ];

      // Add hash from upload tags
      const hashTag = uploadTags.find(t => t[0] === 'x');
      if (hashTag) tags.push(['x', hashTag[1]]);

      // Add original hash if present
      const oxTag = uploadTags.find(t => t[0] === 'ox');
      if (oxTag) tags.push(['ox', oxTag[1]]);

      // Add file size
      const sizeTag = uploadTags.find(t => t[0] === 'size');
      if (sizeTag) tags.push(['size', sizeTag[1]]);

      // Alt tag with app name
      const altText = appName ? `Webxdc app: ${appName}` : 'Webxdc app';
      tags.push(['alt', altText]);

      // Webxdc UUID for state coordination
      const uuid = crypto.randomUUID();
      tags.push(['webxdc', uuid]);

      // App icon thumbnail
      if (iconUrl) tags.push(['image', iconUrl]);

      await createEvent({
        kind: 1063,
        content: description || (appName ? `${appName}` : ''),
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      toast({ title: 'Published', description: `${appName ?? 'Webxdc app'} shared successfully.` });
      queryClient.invalidateQueries({ queryKey: ['webxdc-feed'] });
      handleOpenChange(false);
    } catch {
      toast({ title: 'Publish failed', description: 'Could not publish the webxdc app.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [file, user, appName, description, uploadFile, createEvent, queryClient, handleOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Blocks className="size-5" />
            Share Webxdc App
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* File picker */}
          <div className="space-y-2">
            <Label>App file</Label>
            {file ? (
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-muted/30">
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={appName ?? 'App icon'}
                    className="size-10 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex items-center justify-center size-10 rounded-xl bg-primary/10">
                    <Blocks className="size-5 text-primary" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{appName ?? file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {isExtracting ? 'Reading metadata...' : file.name}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    reset();
                    fileInputRef.current?.click();
                  }}
                >
                  Change
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex flex-col items-center gap-3 p-8 rounded-xl border-2 border-dashed border-border hover:border-primary/50 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                  <Upload className="size-5 text-muted-foreground" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">Choose a .xdc file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Webxdc apps are sandboxed HTML5 archives</p>
                </div>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xdc"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="webxdc-description">Description</Label>
            <Textarea
              id="webxdc-description"
              placeholder="What does this app do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!file || isUploading || isExtracting}
            className="w-full rounded-full"
          >
            {isUploading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Publishing...
              </>
            ) : (
              'Publish'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
