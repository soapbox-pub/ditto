import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePostComment } from '@/hooks/usePostComment';
import { LoginArea } from '@/components/auth/LoginArea';
import { NostrEvent } from '@nostrify/nostrify';
import { MessageSquare, Send } from 'lucide-react';

interface CommentFormProps {
  root: NostrEvent | URL;
  reply?: NostrEvent | URL;
  onSuccess?: () => void;
  placeholder?: string;
  compact?: boolean;
}

export function CommentForm({
  root,
  reply,
  onSuccess, 
  placeholder = "Write a comment...",
  compact = false 
}: CommentFormProps) {
  const [content, setContent] = useState('');
  const { user } = useCurrentUser();
  const { mutate: postComment, isPending } = usePostComment();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim() || !user) return;

    postComment(
      { content: content.trim(), root, reply },
      {
        onSuccess: () => {
          setContent('');
          onSuccess?.();
        },
      }
    );
  };

  if (!user) {
    return (
      <Card className={compact ? "border-dashed" : ""}>
        <CardContent className={compact ? "p-4" : "p-6"}>
          <div className="text-center space-y-4">
            <div className="flex items-center justify-center space-x-2 text-muted-foreground">
              <MessageSquare className="h-5 w-5" />
              <span>Sign in to {reply ? 'reply' : 'comment'}</span>
            </div>
            <LoginArea />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={compact ? "border-dashed" : ""}>
      <CardContent className={compact ? "p-4" : "p-6"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={placeholder}
            className={compact ? "min-h-[80px]" : "min-h-[100px]"}
            disabled={isPending}
          />
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {reply ? 'Replying to comment' : 'Adding to the discussion'}
            </span>
            <Button 
              type="submit" 
              disabled={!content.trim() || isPending}
              size={compact ? "sm" : "default"}
            >
              <Send className="h-4 w-4 mr-2" />
              {isPending ? 'Posting...' : (reply ? 'Reply' : 'Comment')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}