import { useMemo } from 'react';
import { useIntl } from 'react-intl';

import { MyFollowPacksList } from '@/components/MyFollowPacksList';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

const packsDef = getExtraKindDef('packs')!;

/** People lists feed with a "My Packs" tab listing the user's own follow packs to edit. */
export function PeopleListsPage() {
  const intl = useIntl();

  const leadingTab = useMemo(() => ({
    id: 'mine',
    label: intl.formatMessage({ id: 'packs.tabs.mine', defaultMessage: 'My Packs' }),
    content: <MyFollowPacksList />,
  }), [intl]);

  return (
    <KindFeedPage
      kind={packsDef.kind}
      title={packsDef.label}
      icon={sidebarItemIcon('packs', 'size-5')}
      leadingTab={leadingTab}
    />
  );
}
