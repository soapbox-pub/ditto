import { useState } from 'react';
import { ComposeBox } from '@/components/ComposeBox';
import { NoteCard } from '@/components/NoteCard';
import { Skeleton } from '@/components/ui/skeleton';
import { useFeed } from '@/hooks/useFeed';
import { cn } from '@/lib/utils';

export function Feed() {
  const [activeTab, setActiveTab] = useState<'follows' | 'global'>('follows');
  const { data: events, isLoading } = useFeed(activeTab);

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l lg:border-r border-border min-h-screen">
      {/* Compose area */}
      <ComposeBox compact />

      {/* Tabs — stick below the mobile top bar (48px) on small screens, top-0 on desktop */}
      <div className="flex border-b border-border sticky top-10 sidebar:top-0 bg-background/80 backdrop-blur-md">
        <TabButton
          label="Follows"
          active={activeTab === 'follows'}
          onClick={() => setActiveTab('follows')}
        />
        <TabButton
          label="Global"
          active={activeTab === 'global'}
          onClick={() => setActiveTab('global')}
        />
      </div>

      {/* Feed content */}
      {isLoading ? (
        <div className="divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <NoteCardSkeleton key={i} />
          ))}
        </div>
      ) : events && events.length > 0 ? (
        <div>
          {events.map((event) => (
            <NoteCard key={event.id} event={event} />
          ))}
        </div>
      ) : (
        <div className="py-16 px-8 text-center">
          <p className="text-muted-foreground text-lg">
            No posts yet. Follow some people or switch to the Global tab to discover content.
          </p>
        </div>
      )}
    </main>
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

function NoteCardSkeleton() {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="flex gap-3">
        <Skeleton className="size-11 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-8" />
          </div>
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="flex gap-12 mt-2">
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
            <Skeleton className="h-4 w-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
