import { Bot } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useCurrentUser } from '@/hooks/useCurrentUser';

/** Compact AI chat widget for the sidebar. Points users to the full AI Chat page. */
export function AIChatWidget() {
  const { user } = useCurrentUser();

  if (!user) {
    return (
      <div className="flex flex-col items-center gap-2 py-4 px-2 text-center">
        <Bot className="size-8 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Log in to chat with AI</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 px-3 text-center">
      <pre className="text-xl font-mono text-primary leading-none">{'<[o_o]>'}</pre>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Grab some credits on{' '}
        <a
          href="https://shakespeare.diy"
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline"
        >
          Shakespeare
        </a>
        {' '}to chat with Dork.
      </p>
      <Link
        to="/ai-chat"
        className="text-xs font-medium text-primary hover:underline"
      >
        Open AI Chat
      </Link>
    </div>
  );
}
