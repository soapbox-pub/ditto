import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNavigate } from 'react-router-dom';
import { Mail, Send, PenLine, Settings } from 'lucide-react';
import { FabButton } from '@/components/FabButton';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInbox, useSentLetters } from '@/hooks/useLetters';
import { useLetterPreferences } from '@/hooks/useLetterPreferences';
import { useFollowList } from '@/hooks/useFollowActions';
import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { LetterCard } from '@/components/letter/LetterCard';
import { ComposeLetterSheet } from '@/components/letter/ComposeLetterSheet';

type Tab = 'inbox' | 'sent';

function LetterSkeleton() {
  return (
    <div className="rounded-3xl overflow-hidden shadow-sm">
      <Skeleton className="h-16 w-full" />
      <div className="bg-card px-4 pb-5 pt-1">
        <div className="flex items-center gap-3">
          <Skeleton className="w-9 h-9 rounded-full" />
          <div className="flex-1 space-y-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function LettersPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('inbox');
  const [composing, setComposing] = useState(false);

  const { prefs } = useLetterPreferences();
  const followListData = useFollowList();
  const followedPubkeys = followListData.data?.pubkeys;

  // If friendsOnlyInbox is enabled, only show letters from followed users
  const inboxFilter = prefs.friendsOnlyInbox && followedPubkeys
    ? followedPubkeys
    : undefined;

  const { data: inbox, isLoading: inboxLoading } = useInbox(inboxFilter);
  const { data: sent, isLoading: sentLoading } = useSentLetters();

  useSeoMeta({ title: 'Letters', description: 'Your private encrypted letters' });

  if (composing) {
    return <ComposeLetterSheet onClose={() => setComposing(false)} />;
  }

  if (!user) {
    return (
      <main className="min-h-screen pb-16 sidebar:pb-0">
        <PageHeader title="Letters" icon={<Mail className="size-5" />} backTo="/" />
        <div className="flex flex-col items-center justify-center py-24 gap-6 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Your personal inbox</h2>
            <p className="text-muted-foreground text-sm max-w-xs">
              Send and receive beautiful encrypted letters with stationery, frames, and stickers.
            </p>
          </div>
          <LoginArea />
        </div>
      </main>
    );
  }

  const activeLetters = tab === 'inbox' ? inbox : sent;
  const isLoading = tab === 'inbox' ? inboxLoading : sentLoading;

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title="Letters" icon={<Mail className="size-5" />} backTo="/" />

      {/* Tabs + settings */}
      <div className="flex items-center gap-1 px-4 pt-2 pb-1">
        <button
          onClick={() => setTab('inbox')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === 'inbox'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Mail className="w-4 h-4" />
          Inbox
        </button>
        <button
          onClick={() => setTab('sent')}
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            tab === 'sent'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Send className="w-4 h-4" />
          Sent
        </button>
        <div className="flex-1" />
        <button
          onClick={() => navigate('/settings/letters')}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Letter preferences"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Letter list */}
      <div className="px-4 py-2 space-y-3">
        {isLoading && (
          <>
            <LetterSkeleton />
            <LetterSkeleton />
            <LetterSkeleton />
          </>
        )}

        {!isLoading && activeLetters && activeLetters.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <Mail className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-muted-foreground text-sm">
              {tab === 'inbox'
                ? prefs.friendsOnlyInbox
                  ? 'no letters from friends yet'
                  : 'no letters yet'
                : 'no sent letters yet'
              }
            </p>
            {tab === 'inbox' && (
              <p className="text-xs text-muted-foreground opacity-70">
                ask a friend to send you a letter on lief.pages.dev
              </p>
            )}
          </div>
        )}

        {!isLoading && activeLetters?.map((letter) => (
          <LetterCard
            key={letter.event.id}
            letter={letter}
            mode={tab}
          />
        ))}
      </div>

      {/* Compose FAB */}
      <div className="fixed bottom-fab right-6 z-30 sidebar:hidden">
        <FabButton onClick={() => setComposing(true)} icon={<PenLine size={18} strokeWidth={3} />} title="Write a letter" />
      </div>
      <div className="hidden sidebar:block sticky bottom-6 z-30 pointer-events-none">
        <div className="flex justify-end pr-4">
          <div className="pointer-events-auto">
            <FabButton onClick={() => setComposing(true)} icon={<PenLine size={18} strokeWidth={3} />} title="Write a letter" />
          </div>
        </div>
      </div>
    </main>
  );
}
