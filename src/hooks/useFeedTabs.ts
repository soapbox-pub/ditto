import { useState, useEffect, useMemo } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import type { FeedTab } from '@/components/FeedTabs';

/** Shared state and settings for the Follows / Community / Global tab bar. */
export function useFeedTabs() {
  const { user } = useCurrentUser();

  const showGlobalFeed = (() => {
    const stored = localStorage.getItem('mew:showGlobalFeed');
    return stored !== null ? stored === 'true' : true;
  })();

  const showCommunityFeed = (() => {
    const stored = localStorage.getItem('mew:showCommunityFeed');
    return stored !== null ? stored === 'true' : false;
  })();

  const communityLabel = (() => {
    try {
      const stored = localStorage.getItem('mew:community');
      if (stored) {
        const community = JSON.parse(stored);
        return community.label || 'Community';
      }
    } catch {
      // Fall through
    }
    return 'Community';
  })();

  const [activeTab, setActiveTab] = useState<FeedTab>(user ? 'follows' : 'global');

  // Switch to follows tab when user logs in
  useEffect(() => {
    if (user) {
      setActiveTab('follows');
    }
  }, [user]);

  const queryKey = useMemo(() => ['feed', activeTab], [activeTab]);

  return {
    user,
    activeTab,
    setActiveTab,
    showGlobalFeed,
    showCommunityFeed,
    communityLabel,
    queryKey,
  };
}
