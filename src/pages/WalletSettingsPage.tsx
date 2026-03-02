import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { WalletSettings } from '@/components/WalletSettings';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function WalletSettingsPage() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  useSeoMeta({
    title: `Wallet | Settings | ${config.appName}`,
    description: 'Manage your wallet connections',
  });

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="">
      {/* Header with back link */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-4">
          <Link to="/settings" className="p-2 -ml-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Wallet</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage wallet connections and payments
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <WalletSettings />
      </div>
    </main>
  );
}
