import { useSeoMeta } from '@unhead/react';
import { LetterPreferencesSection } from '@/components/letter/LetterPreferencesSection';

export function LetterPreferencesPage() {
  useSeoMeta({
    title: 'Letter Preferences',
    description: 'Customize your default letter stationery, font, and inbox settings',
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <LetterPreferencesSection />
    </main>
  );
}
