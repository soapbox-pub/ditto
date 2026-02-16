import { useComments } from '@/hooks/useComments';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NostrEvent } from '@nostrify/nostrify';
import { CommentForm } from './CommentForm';
import { Comment } from './Comment';

interface CommentsSectionProps {
  root: NostrEvent | URL;
  title?: string;
  emptyStateMessage?: string;
  emptyStateSubtitle?: string;
  className?: string;
  limit?: number;
}

export function CommentsSection({ 
  root,
  title = "Comments",
  emptyStateMessage = "No comments yet",
  emptyStateSubtitle = "Be the first to share your thoughts!",
  className,
  limit = 500,
}: CommentsSectionProps) {
  const { data: commentsData, isLoading, error } = useComments(root, limit);
  const comments = commentsData?.topLevelComments || [];

  if (error) {
    return (
      <Card className="rounded-none sm:rounded-lg mx-0 sm:mx-0">
        <CardContent className="px-2 py-6 sm:p-6">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Failed to load comments</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("rounded-none sm:rounded-lg mx-0 sm:mx-0", className)}>
      <CardHeader className="px-2 pt-6 pb-4 sm:p-6">
        <CardTitle className="flex items-center space-x-2">
          <MessageSquare className="h-5 w-5" />
          <span>{title}</span>
          {!isLoading && (
            <span className="text-sm font-normal text-muted-foreground">
              ({comments.length})
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-6 pt-4 sm:p-6 sm:pt-0 space-y-6">
        {/* Comment Form */}
        <CommentForm root={root} />

        {/* Comments List */}
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="bg-card/50">
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <div className="space-y-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <Skeleton className="h-16 w-full" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium mb-2">{emptyStateMessage}</p>
            <p className="text-sm">{emptyStateSubtitle}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {comments.map((comment) => (
              <Comment
                key={comment.id}
                root={root}
                comment={comment}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}