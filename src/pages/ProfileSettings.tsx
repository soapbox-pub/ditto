import { useSeoMeta } from '@unhead/react';
import { ArrowLeft } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { EditProfileForm } from '@/components/EditProfileForm';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function ProfileSettings() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  useSeoMeta({
    title: `Profile | Settings | ${config.appName}`,
    description: `Edit your ${config.appName} profile`,
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
            <h1 className="text-xl font-bold">Profile</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Edit your display name, bio, and avatar
            </p>
          </div>
        </div>
      </div>

      <div className="p-4">
        <EditProfileForm />
      </div>
    </main>
  );
}
