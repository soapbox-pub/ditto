import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { ProfileSearchDropdown } from '@/components/ProfileSearchDropdown';

export function SearchPage() {
  useSeoMeta({
    title: 'Search | Mew',
    description: 'Search Nostr',
  });

  return (
    <MainLayout hideMobileTopBar>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l lg:border-r border-border min-h-screen">
        <div className="flex items-center gap-3 px-4 py-3 sticky top-0 bg-background/80 backdrop-blur-md z-10 border-b border-border">
          <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors shrink-0">
            <ArrowLeft className="size-5" />
          </Link>
          <ProfileSearchDropdown
            placeholder="Search people..."
            className="flex-1"
            autoFocus
          />
        </div>

        <div className="py-16 text-center text-muted-foreground">
          Search for people by name or NIP-05 address.
        </div>
      </main>
    </MainLayout>
  );
}
