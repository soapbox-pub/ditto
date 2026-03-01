import { useState, useCallback } from 'react';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from '@/pages/KindFeedPage';
import { WebxdcUploadDialog } from '@/components/WebxdcUploadDialog';

const webxdcDef = getExtraKindDef('webxdc')!;
const TAG_FILTERS = { '#m': ['application/x-webxdc'] };

export function WebxdcFeedPage() {
  const [uploadOpen, setUploadOpen] = useState(false);

  const handleFabClick = useCallback(() => {
    setUploadOpen(true);
  }, []);

  return (
    <KindFeedPage
      kind={webxdcDef.kind}
      title={webxdcDef.label}
      icon={sidebarItemIcon('webxdc', 'size-5')}
      tagFilters={TAG_FILTERS}
      onFabClick={handleFabClick}
      emptyMessage="No webxdc apps found yet. Check your relay connections or try again later."
      extra={<WebxdcUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} />}
    />
  );
}
