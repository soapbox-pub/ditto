import { useState, useCallback } from 'react';
import { Blocks } from 'lucide-react';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { KindFeedPage } from '@/pages/KindFeedPage';
import { WebxdcUploadDialog } from '@/components/WebxdcUploadDialog';

const TAG_FILTERS = { '#m': ['application/x-webxdc'] };

export function WebxdcFeedPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleFabClick = useCallback(() => {
    setUploadOpen(true);
  }, []);

  useLayoutOptions({ showFAB: true, fabKind: 1063, onFabClick: handleFabClick });

  return (
    <KindFeedPage
      kind={1063}
      title="Webxdc"
      icon={<Blocks className="size-5" />}
      tagFilters={TAG_FILTERS}
      emptyMessage="No webxdc apps found yet. Check your relay connections or try again later."
      extra={<WebxdcUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />}
    />
  );
}
