import { useSeoMeta } from '@unhead/react';
import { Mail } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { LetterPreferencesSection } from '@/components/letter/LetterPreferencesSection';

export function LetterPreferencesPage() {
  useSeoMeta({
    title: 'Letter Preferences',
    description: 'Customize your default letter stationery, font, and inbox settings',
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader
        title="Letter Preferences"
        icon={<Mail className="size-5" />}
        backTo="/letters"
      />
      <LetterPreferencesSection />
    </main>
  );
}
