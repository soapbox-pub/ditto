import { useSeoMeta } from '@unhead/react';
import { Feed } from '@/components/Feed';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';

const Index = () => {
  const { config } = useAppContext();

  useSeoMeta({
    title: config.appName,
    description: 'Your content. Your vibe. Your rules.',
  });

  useLayoutOptions({ showFAB: true, fabKind: 1 });

  return <Feed />;
};

export default Index;
