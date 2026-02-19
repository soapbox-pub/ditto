import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, Settings as SettingsIcon } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { MainLayout } from '@/components/MainLayout';
import { EditProfileForm } from '@/components/EditProfileForm';
import { RelayListManager } from '@/components/RelayListManager';
import { FeedSettingsForm } from '@/components/FeedSettingsForm';
import { WalletSettings } from '@/components/WalletSettings';
import { MuteSettings } from '@/components/MuteSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';

export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: 'Settings | Mew',
    description: 'Manage your Mew settings',
  });

  const activeSection = section || 'profile';

  return (
    <MainLayout>
      <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
        <div className={cn(STICKY_HEADER_CLASS, 'px-4 my-4 bg-background/80 backdrop-blur-md z-10')}>
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 rounded-full hover:bg-secondary transition-colors sidebar:hidden">
              <ArrowLeft className="size-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <SettingsIcon className="size-5" />
                <h1 className="text-xl font-bold">Settings</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">Manage your profile, feed, and preferences</p>
            </div>
          </div>
        </div>

        {/* Tab navigation */}
        <div className="flex border-b border-border">
          <SettingsTab to="/settings/profile" label="Profile" active={activeSection === 'profile'} />
          <SettingsTab to="/settings/feed" label="Feed" active={activeSection === 'feed'} />
          <SettingsTab to="/settings/mutes" label="Mutes" active={activeSection === 'mutes'} />
          <SettingsTab to="/settings/relays" label="Relays" active={activeSection === 'relays'} />
          <SettingsTab to="/settings/wallet" label="Wallet" active={activeSection === 'wallet'} />
        </div>

        <div className="p-4">
          {activeSection === 'mutes' ? (
            !user ? (
              <p className="text-center text-muted-foreground py-8">Log in to manage your mute list.</p>
            ) : (
              <MuteSettings />
            )
          ) : activeSection === 'feed' ? (
            <FeedSettingsForm />
          ) : activeSection === 'wallet' ? (
            !user ? (
              <p className="text-center text-muted-foreground py-8">Log in to manage your wallet.</p>
            ) : (
              <WalletSettings />
            )
          ) : !user ? (
            <p className="text-center text-muted-foreground py-8">Log in to manage settings.</p>
          ) : activeSection === 'profile' ? (
            <EditProfileForm />
          ) : activeSection === 'relays' ? (
            <RelayListManager />
          ) : null}
        </div>
      </main>
    </MainLayout>
  );
}

function SettingsTab({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex-1 py-3.5 text-center text-sm font-medium transition-colors relative hover:bg-secondary/40',
        active ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {label}
      {active && (
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-primary rounded-full" />
      )}
    </Link>
  );
}
