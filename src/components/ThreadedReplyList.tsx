import type { NostrEvent } from '@nostrify/nostrify';
import { NoteCard } from '@/components/NoteCard';

export interface ThreadedReply {
  reply: NostrEvent;
  firstSubReply?: NostrEvent;
}

interface ThreadedReplyListProps {
  replies: ThreadedReply[];
}

/**
 * Renders a flat list of replies where each top-level reply is optionally
 * followed by its first sub-reply, using NoteCard's threaded/threadedLast
 * connector-line styling for visual continuity.
 */
export function ThreadedReplyList({ replies }: ThreadedReplyListProps) {
  return (
    <div className="divide-y divide-border">
      {replies.map(({ reply, firstSubReply }) => (
        <div key={reply.id}>
          <NoteCard event={reply} threaded={!!firstSubReply} />
          {firstSubReply && (
            <NoteCard event={firstSubReply} threadedLast />
          )}
        </div>
      ))}
    </div>
  );
}
