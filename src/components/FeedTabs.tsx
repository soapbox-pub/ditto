import { cn } from '@/lib/utils';

export type FeedTab = 'follows' | 'global' | 'communities';

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
  showGlobalFeed: boolean;
  showCommunityFeed: boolean;
  communityLabel: string;
}

/** Shared tab bar for Follows / Community / Global feed switching. */
export function FeedTabs({
  activeTab,
  onTabChange,
  showGlobalFeed,
  showCommunityFeed,
  communityLabel,
}: FeedTabsProps) {
  return (
    <div className="flex border-b border-border sticky top-mobile-bar sidebar:top-0 bg-background/80 backdrop-blur-md z-10">
      <TabButton
        label="Follows"
        active={activeTab === 'follows'}
        onClick={() => onTabChange('follows')}
      />
      {showCommunityFeed && (
        <TabButton
          label={communityLabel}
          active={activeTab === 'communities'}
          onClick={() => onTabChange('communities')}
        />
      )}
      {showGlobalFeed && (
        <TabButton
          label="Global"
          active={activeTab === 'global'}
          onClick={() => onTabChange('global')}
        />
      )}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </button>
  );
}
