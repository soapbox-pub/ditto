import { useSeoMeta } from '@unhead/react';
import { Feed } from '@/components/Feed';
import { useLayoutOptions } from '@/contexts/LayoutContext';

const Index = () => {
  useSeoMeta({
    title: 'Ditto',
    description: 'A Nostr client for the social web.',
  });

  useLayoutOptions({ showFAB: true });

  return <Feed />;
};

export default Index;
