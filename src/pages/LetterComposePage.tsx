import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { ComposeLetterSheet } from '@/components/letter/ComposeLetterSheet';

export function LetterComposePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const toPubkey = searchParams.get('to') ?? undefined;

  useLayoutOptions({ showFAB: false, noOverscroll: true });
  useSeoMeta({ title: 'Write a Letter' });

  return (
    <main className="relative h-screen overflow-hidden" style={{ touchAction: 'none' }}>
      <ComposeLetterSheet
        toPubkey={toPubkey}
        onClose={() => navigate('/letters')}
      />
    </main>
  );
}
