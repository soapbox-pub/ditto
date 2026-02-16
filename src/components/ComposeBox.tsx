import { useState, useRef, useCallback } from 'react';
import { Paperclip, Smile, AlertTriangle, X, Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

const MAX_CHARS = 5000;

interface ComposeBoxProps {
  onSuccess?: () => void;
  placeholder?: string;
  compact?: boolean;
}

/** Circular progress ring for character count. */
function CharRing({ count, max }: { count: number; max: number }) {
  const radius = 10;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.min(count / max, 1);
  const offset = circumference * (1 - ratio);
  const overLimit = count > max;
  const nearLimit = count > max * 0.9;

  return (
    <div className="relative flex items-center justify-center size-7">
      <svg width="28" height="28" viewBox="0 0 28 28" className="-rotate-90">
        {/* Background ring */}
        <circle
          cx="14" cy="14" r={radius}
          fill="none"
          strokeWidth="2.5"
          className="stroke-secondary"
        />
        {/* Progress ring */}
        <circle
          cx="14" cy="14" r={radius}
          fill="none"
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={cn(
            'transition-all duration-150',
            overLimit ? 'stroke-destructive' : nearLimit ? 'stroke-amber-500' : 'stroke-primary',
          )}
        />
      </svg>
    </div>
  );
}

export function ComposeBox({ onSuccess, placeholder = "What's on your mind?", compact = false }: ComposeBoxProps) {
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [content, setContent] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [cwEnabled, setCwEnabled] = useState(false);
  const [cwText, setCwText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!user && compact) return null;

  const charCount = content.length;
  const remaining = MAX_CHARS - charCount;

  const expand = useCallback(() => {
    if (!expanded) setExpanded(true);
  }, [expanded]);

  const handleFileUpload = async (file: File) => {
    try {
      const [[, url]] = await uploadFile(file);
      setContent((prev) => (prev ? prev + '\n' + url : url));
      expand();
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload file.', variant: 'destructive' });
    }
  };

  const handleSubmit = async () => {
    if (!content.trim() || !user || charCount > MAX_CHARS) return;

    try {
      const hashtags = content.match(/#\w+/g)?.map((t) => t.slice(1)) || [];
      const tags: string[][] = hashtags.map((t) => ['t', t.toLowerCase()]);

      // NIP-36: content warning
      if (cwEnabled) {
        tags.push(['content-warning', cwText || '']);
        tags.push(['L', 'content-warning']);
        if (cwText) {
          tags.push(['l', cwText, 'content-warning']);
        }
      }

      await createEvent({
        kind: 1,
        content: content.trim(),
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      setContent('');
      setCwEnabled(false);
      setCwText('');
      setExpanded(false);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast({ title: 'Posted!', description: 'Your note has been published.' });
      onSuccess?.();
    } catch {
      toast({ title: 'Error', description: 'Failed to publish note.', variant: 'destructive' });
    }
  };

  const isExpanded = expanded || content.length > 0 || !compact;

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-border">
      <Avatar className="size-11 shrink-0 mt-0.5">
        <AvatarImage src={metadata?.picture} alt={metadata?.name} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {user ? (metadata?.name?.[0] || '?').toUpperCase() : '?'}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={expand}
          placeholder={placeholder}
          className={cn(
            'w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-lg py-2',
            isExpanded ? 'min-h-[100px]' : 'min-h-[44px]',
          )}
          rows={isExpanded ? 4 : 1}
          disabled={!user}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
        />

        {/* Content warning input */}
        {cwEnabled && (
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="size-4 text-amber-500 shrink-0" />
            <Input
              value={cwText}
              onChange={(e) => setCwText(e.target.value)}
              placeholder="Content warning reason (optional)"
              className="h-8 text-sm bg-secondary/50 border-0 rounded-lg"
            />
            <button
              onClick={() => { setCwEnabled(false); setCwText(''); }}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <X className="size-4" />
            </button>
          </div>
        )}

        {/* Toolbar + post button */}
        {isExpanded && (
          <div className="flex items-center justify-between mt-1">
            {/* Left: action icons */}
            <div className="flex items-center gap-1 -ml-2">
              {/* File upload */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading || !user}
                    className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                  >
                    {isUploading ? <Loader2 className="size-[18px] animate-spin" /> : <Paperclip className="size-[18px]" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>Attach file</TooltipContent>
              </Tooltip>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
              />

              {/* Emoji placeholder */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                  >
                    <Smile className="size-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Emoji</TooltipContent>
              </Tooltip>

              {/* Content warning (NIP-36) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => setCwEnabled(!cwEnabled)}
                    className={cn(
                      'p-2 rounded-full transition-colors',
                      cwEnabled
                        ? 'text-amber-500 bg-amber-500/10'
                        : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10',
                    )}
                  >
                    <AlertTriangle className="size-[18px]" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Content warning (NIP-36)</TooltipContent>
              </Tooltip>
            </div>

            {/* Right: char count + post button */}
            <div className="flex items-center gap-3">
              {charCount > 0 && (
                <div className="flex items-center gap-1.5">
                  <CharRing count={charCount} max={MAX_CHARS} />
                  <span className={cn(
                    'text-xs tabular-nums',
                    remaining < 0 ? 'text-destructive font-semibold' : remaining < 500 ? 'text-amber-500' : 'text-muted-foreground',
                  )}>
                    {remaining}
                  </span>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={!content.trim() || isPending || !user || charCount > MAX_CHARS}
                className="rounded-full px-5 font-bold"
                size="sm"
              >
                {isPending ? 'Posting...' : 'Post!'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
