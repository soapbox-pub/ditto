import { useState } from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/useToast';

interface ComposeBoxProps {
  onSuccess?: () => void;
  placeholder?: string;
  compact?: boolean;
}

export function ComposeBox({ onSuccess, placeholder = "What's on your mind?", compact = false }: ComposeBoxProps) {
  const { user, metadata } = useCurrentUser();
  const { mutateAsync: createEvent, isPending } = useNostrPublish();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [content, setContent] = useState('');

  if (!user && compact) return null;

  const handleSubmit = async () => {
    if (!content.trim() || !user) return;

    try {
      // Extract hashtags from content
      const hashtags = content.match(/#\w+/g)?.map((t) => t.slice(1)) || [];
      const tags = hashtags.map((t) => ['t', t.toLowerCase()]);

      await createEvent({
        kind: 1,
        content: content.trim(),
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      setContent('');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast({ title: 'Posted!', description: 'Your note has been published.' });
      onSuccess?.();
    } catch {
      toast({ title: 'Error', description: 'Failed to publish note.', variant: 'destructive' });
    }
  };

  return (
    <div className="flex gap-3 px-4 py-3 border-b border-border">
      <Avatar className="size-11 shrink-0">
        <AvatarImage src={metadata?.picture} alt={metadata?.name} />
        <AvatarFallback className="bg-primary/20 text-primary text-sm">
          {user ? (metadata?.name?.[0] || '?').toUpperCase() : '?'}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-transparent text-foreground placeholder:text-muted-foreground resize-none outline-none text-lg py-2 min-h-[44px]"
          rows={compact ? 1 : 2}
          disabled={!user}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              handleSubmit();
            }
          }}
        />
        {(content.trim() || !compact) && (
          <div className="flex justify-end mt-2">
            <Button
              onClick={handleSubmit}
              disabled={!content.trim() || isPending || !user}
              className="rounded-full px-6 font-bold"
              size="sm"
            >
              {isPending ? 'Posting...' : 'Post'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
