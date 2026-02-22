import { useState } from 'react';
import { ComposeBox } from '@/components/ComposeBox';
import { FeedTabs } from '@/components/FeedTabs';
import { InfiniteFeed } from '@/components/InfiniteFeed';
import { Button } from '@/components/ui/button';
import LoginDialog from '@/components/auth/LoginDialog';
import { useOnboarding } from '@/components/InitialSyncGate';
import { useFeed } from '@/hooks/useFeed';
import { useFeedTabs } from '@/hooks/useFeedTabs';

export function Feed() {
  const {
    user,
    activeTab,
    setActiveTab,
    showGlobalFeed,
    showCommunityFeed,
    communityLabel,
    queryKey,
  } = useFeedTabs();

  const [loginDialogOpen, setLoginDialogOpen] = useState(false);
  const { startSignup } = useOnboarding();

  const feedQuery = useFeed(activeTab);

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Compose area */}
      <ComposeBox compact />

      {/* Tabs (logged in) or CTA (logged out) */}
      {user ? (
        <FeedTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          showGlobalFeed={showGlobalFeed}
          showCommunityFeed={showCommunityFeed}
          communityLabel={communityLabel}
        />
      ) : (
        <div className="border-b border-border sticky top-mobile-bar sidebar:top-0 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 backdrop-blur-md z-10 py-3">
          <div className="flex items-center justify-center gap-3 px-6">
            <p className="text-[13px] sidebar:text-sm text-muted-foreground">
              Follow accounts you care about on Mew
            </p>
            <Button
              onClick={() => setLoginDialogOpen(true)}
              className="rounded-full"
              size="sm"
            >
              Join
            </Button>
          </div>
        </div>
      )}

      {/* Feed content */}
      <InfiniteFeed
        data={feedQuery.data}
        isPending={feedQuery.isPending}
        isLoading={feedQuery.isLoading}
        fetchNextPage={feedQuery.fetchNextPage}
        hasNextPage={feedQuery.hasNextPage}
        isFetchingNextPage={feedQuery.isFetchingNextPage}
        queryKey={queryKey}
        emptyMessage="No posts yet. Follow some people or switch to the Global tab to discover content."
      />

      {/* Login/Signup dialogs */}
      <LoginDialog
        isOpen={loginDialogOpen}
        onClose={() => setLoginDialogOpen(false)}
        onLogin={() => setLoginDialogOpen(false)}
        onSignupClick={startSignup}
      />
    </main>
  );
}
