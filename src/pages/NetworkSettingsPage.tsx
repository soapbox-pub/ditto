import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { RelayListManager } from '@/components/RelayListManager';
import { BlossomSettings } from '@/components/BlossomSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function NetworkSettingsPage() {
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'Network | Settings | Ditto',
    description: 'Manage relays and file upload servers',
  });

  if (!user) {
    return <Navigate to="/settings/advanced" replace />;
  }

  return (
    <main className="min-h-screen">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings/advanced" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Network</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Relays and file upload servers
            </p>
          </div>
        </div>
      </div>

      <RelayListManager />
      <BlossomSettings />
    </main>
  );
}
