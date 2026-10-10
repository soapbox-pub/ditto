import { useMemo } from 'react';
import { useIntl } from 'react-intl';

import { MyArticlesList } from '@/components/articles/MyArticlesList';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { KindFeedPage } from './KindFeedPage';

const articlesDef = getExtraKindDef('articles')!;

/** Articles feed with a "My Articles" tab for the user's drafts and published articles. */
export function ArticlesPage() {
  const intl = useIntl();

  const leadingTab = useMemo(() => ({
    id: 'mine',
    label: intl.formatMessage({ id: 'articles.tabs.mine', defaultMessage: 'My Articles' }),
    content: <MyArticlesList />,
  }), [intl]);

  return (
    <KindFeedPage
      kind={articlesDef.kind}
      title={articlesDef.label}
      icon={sidebarItemIcon('articles', 'size-5')}
      fabHref="/articles/new"
      leadingTab={leadingTab}
    />
  );
}
