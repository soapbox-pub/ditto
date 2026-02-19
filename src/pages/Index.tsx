import { useSeoMeta } from '@unhead/react';
import { MainLayout } from '@/components/MainLayout';
import { Feed } from '@/components/Feed';

const Index = () => {
  useSeoMeta({
    title: 'Mew',
    description: 'A Nostr client for the social web.',
  });

  return (
    <MainLayout showFAB>
      <Feed />
    </MainLayout>
  );
};

export default Index;
