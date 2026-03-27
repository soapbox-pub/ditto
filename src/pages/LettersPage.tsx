import { useState } from 'react';
import { useSeoMeta } from '@unhead/react';
import { useNavigate } from 'react-router-dom';
import { PenLine, Settings, Loader2 } from 'lucide-react';
import { MailboxIcon } from '@/components/icons/MailboxIcon';
import { Button } from '@/components/ui/button';
import { FabButton } from '@/components/FabButton';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useInbox, useSentLetters } from '@/hooks/useLetters';
import { useLetterPreferences } from '@/hooks/useLetterPreferences';
import { useFollowList } from '@/hooks/useFollowActions';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { LoginArea } from '@/components/auth/LoginArea';
import { PageHeader } from '@/components/PageHeader';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { EnvelopeCard } from '@/components/letter/EnvelopeCard';
import { LetterDetailSheet } from '@/components/letter/LetterDetailSheet';
import { ComposeLetterSheet } from '@/components/letter/ComposeLetterSheet';
import type { Letter } from '@/lib/letterTypes';

type Tab = 'inbox' | 'sent';

/** Skeleton envelope matching the grid tile shape. */
function EnvelopeSkeleton({ index }: { index: number }) {
  return (
    <div
      className="envelope-skeleton flex flex-col items-center gap-2"
      style={{ animationDelay: `${index * 150}ms` }}
    >
      <div className="w-full rounded-lg bg-muted/60" style={{ aspectRatio: '4 / 3' }} />
      <div className="flex flex-col items-center gap-1 w-full">
        <div className="h-3 w-14 rounded-full bg-muted/50" />
        <div className="h-2 w-10 rounded-full bg-muted/30" />
      </div>
    </div>
  );
}

export function LettersPage() {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('inbox');
  const [composing, setComposing] = useState(false);
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);

  useLayoutOptions({ showFAB: false, hasSubHeader: !!user, noOverscroll: composing });

  const { prefs } = useLetterPreferences();
  const followListData = useFollowList();
  const followedPubkeys = followListData.data?.pubkeys;

  // If friendsOnlyInbox is enabled, only show letters from followed users
  const inboxFilter = prefs.friendsOnlyInbox && followedPubkeys
    ? followedPubkeys
    : undefined;

  const inboxQuery = useInbox(inboxFilter);
  const sentQuery = useSentLetters();

  const inbox = inboxQuery.data;
  const inboxLoading = inboxQuery.isLoading;
  const sent = sentQuery.data;
  const sentLoading = sentQuery.isLoading;

  const activeQuery = tab === 'inbox' ? inboxQuery : sentQuery;

  useSeoMeta({ title: 'Letters', description: 'Your private encrypted letters' });

  if (!user) {
    return (
      <main className="min-h-screen pb-16 sidebar:pb-0">
        <PageHeader title="Letters" icon={<MailboxIcon className="size-5" />} backTo="/" />
        <div className="flex flex-col items-center justify-center py-24 gap-6 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <MailboxIcon className="w-10 h-10 text-primary" />
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
    <main
      className={composing ? 'relative h-screen overflow-hidden' : 'relative min-h-screen pb-16 sidebar:pb-0'}
      style={composing ? { touchAction: 'none' } : undefined}
    >
      {composing && (
        <ComposeLetterSheet
          onClose={() => setComposing(false)}
        />
      )}
      <PageHeader title="Letters" icon={<MailboxIcon className="size-5" />} backTo="/" alwaysShowBack>
        <button
          onClick={() => navigate('/settings/letters')}
          className="p-2 rounded-full text-muted-foreground hover:text-foreground transition-colors"
          title="Letter preferences"
        >
          <Settings className="w-4 h-4" />
        </button>
      </PageHeader>

      {/* Tabs */}
      <SubHeaderBar>
        <TabButton label="Inbox" active={tab === 'inbox'} onClick={() => setTab('inbox')} />
        <TabButton label="Sent" active={tab === 'sent'} onClick={() => setTab('sent')} />
      </SubHeaderBar>
      <div style={{ height: ARC_OVERHANG_PX }} />

      {/* Envelope grid */}
      <div className="px-4 py-3">
        {isLoading && (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sidebar:grid-cols-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <EnvelopeSkeleton key={i} index={i} />
            ))}
          </div>
        )}

        {!isLoading && activeLetters && activeLetters.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto">
              <MailboxIcon className="w-8 h-8 text-muted-foreground opacity-50" />
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
                ask a friend to send you a letter
              </p>
            )}
          </div>
        )}

        {!isLoading && activeLetters && activeLetters.length > 0 && (
          <>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 sidebar:grid-cols-3">
              {activeLetters.map((letter, i) => (
                <EnvelopeCard
                  key={letter.event.id}
                  letter={letter}
                  mode={tab}
                  index={i}
                  onClick={() => setSelectedLetter(letter)}
                />
              ))}
            </div>
            {activeQuery.hasNextPage && (
              <div className="flex justify-center pt-6 pb-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => activeQuery.fetchNextPage()}
                  disabled={activeQuery.isFetchingNextPage}
                  className="gap-2"
                >
                  {activeQuery.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
                  Load more
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Letter detail drawer */}
      <LetterDetailSheet
        letter={selectedLetter}
        onClose={() => setSelectedLetter(null)}
      />

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
