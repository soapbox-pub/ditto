import { useState, useRef, useCallback } from 'react';
import { Paperclip, Smile, AlertTriangle, X, Loader2 } from 'lucide-react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { EmojiPicker } from '@/components/EmojiPicker';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';

const MAX_CHARS = 5000;

interface ComposeBoxProps {
  onSuccess?: () => void;
  placeholder?: string;
  compact?: boolean;
  /** Event being replied to – adds NIP-10 reply tags when set. */
  replyTo?: NostrEvent;
  /** If true, the compose area is always expanded (e.g. inside a modal). */
  forceExpanded?: boolean;
  /** If true, hides the avatar (useful inside modals with their own layout). */
  hideAvatar?: boolean;
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

export function ComposeBox({ onSuccess, placeholder = "What's on your mind?", compact = false, replyTo, forceExpanded = false, hideAvatar = false }: ComposeBoxProps) {
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [content, setContent] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [cwEnabled, setCwEnabled] = useState(false);
  const [cwText, setCwText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const charCount = content.length;
  const remaining = MAX_CHARS - charCount;

  const expand = useCallback(() => {
    if (!expanded) setExpanded(true);
  }, [expanded]);

  const insertEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.slice(0, start) + emoji + content.slice(end);
      setContent(newContent);
      // Restore cursor position after the inserted emoji
      requestAnimationFrame(() => {
        textarea.focus();
        const pos = start + emoji.length;
        textarea.setSelectionRange(pos, pos);
      });
    } else {
      setContent((prev) => prev + emoji);
    }
    expand();
  }, [content, expand]);

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

      // NIP-10 reply tags
      if (replyTo) {
        // Determine root of the thread
        const rootTag = replyTo.tags.find(([name, , , marker]) => name === 'e' && marker === 'root');
        if (rootTag) {
          // replyTo is itself a reply – preserve the root and mark replyTo as reply
          tags.push(['e', rootTag[1], rootTag[2] || '', 'root', rootTag[4] || '']);
          tags.push(['e', replyTo.id, '', 'reply', replyTo.pubkey]);
        } else {
          // replyTo is a top-level note – it becomes the root
          tags.push(['e', replyTo.id, '', 'root', replyTo.pubkey]);
        }

        // Add p tags: original author + all existing p tags from the parent
        const pPubkeys = new Set<string>();
        pPubkeys.add(replyTo.pubkey);
        for (const tag of replyTo.tags) {
          if (tag[0] === 'p' && tag[1]) pPubkeys.add(tag[1]);
        }
        // Don't include ourselves
        if (user.pubkey) pPubkeys.delete(user.pubkey);
        for (const pk of pPubkeys) {
          tags.push(['p', pk]);
        }
      }

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
      if (replyTo) {
        queryClient.invalidateQueries({ queryKey: ['replies', replyTo.id] });
      }
      toast({ title: 'Posted!', description: replyTo ? 'Your reply has been published.' : 'Your note has been published.' });
      onSuccess?.();
    } catch {
      toast({ title: 'Error', description: 'Failed to publish note.', variant: 'destructive' });
    }
  };

  const isExpanded = forceExpanded || expanded || content.length > 0 || !compact;

  // Early return after all hooks to avoid violating Rules of Hooks
  if (!user && compact) return null;

  return (
    <div className={cn("flex gap-3 px-4 py-3", !forceExpanded && "border-b border-border")}>
      {!hideAvatar && (
        <Avatar className="size-12 shrink-0 mt-0.5">
          <AvatarImage src={metadata?.picture} alt={metadata?.name} />
          <AvatarFallback className="bg-primary/20 text-primary text-sm">
            {user ? (metadata?.name?.[0] || '?').toUpperCase() : '?'}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex-1 min-w-0">
        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onFocus={expand}
          placeholder={placeholder}
          className={cn(
            'w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-lg pt-2.5 pb-2 opacity-85',
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

              {/* Emoji picker */}
              <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          'p-2 rounded-full transition-colors',
                          emojiOpen
                            ? 'text-primary bg-primary/10'
                            : 'text-muted-foreground hover:text-primary hover:bg-primary/10',
                        )}
                      >
                        <Smile className="size-[18px]" />
                      </button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  {!emojiOpen && <TooltipContent>Emoji</TooltipContent>}
                </Tooltip>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  className="w-auto p-0 border-border"
                >
                  <EmojiPicker onSelect={(emoji) => {
                    insertEmoji(emoji);
                  }} />
                </PopoverContent>
              </Popover>

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
