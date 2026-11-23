import { useNavigate, useSearchParams } from 'react-router-dom';

import { MeetPeopleStep } from '@/components/onboarding/MeetPeopleStep';
import { ThemePicker } from '@/components/onboarding/ThemePicker';

/** Dev-only: onboarding steps on their own, without running through signup. `?step=theme` for the theme picker. */
export function WelcomeLabPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-background">
      <div className="mx-auto w-full max-w-2xl px-6 py-12">
        {params.get('step') === 'theme'
          ? <ThemePicker />
          : <MeetPeopleStep onNext={() => navigate('/')} onBack={() => navigate(-1)} />}
      </div>
    </div>
  );
}
