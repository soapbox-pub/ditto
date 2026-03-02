import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { List, Plus, Pin } from 'lucide-react';
import { nip19 } from 'nostr-tools';

import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CreateListDialog } from '@/components/CreateListDialog';
import { KindInfoButton } from '@/components/KindInfoButton';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePersonalLists } from '@/hooks/usePersonalLists';
import { useAuthors } from '@/hooks/useAuthors';
import { useAppContext } from '@/hooks/useAppContext';
import { genUserName } from '@/lib/genUserName';
import { sidebarItemIcon } from '@/lib/sidebarItems';
import { getExtraKindDef } from '@/lib/extraKinds';

const listsDef = getExtraKindDef('lists')!;

export function ListsPage() {
  const { user } = useCurrentUser();
  const { lists } = usePersonalLists();
  const { config } = useAppContext();
  const [createOpen, setCreateOpen] = useState(false);
  const pinnedSet = useMemo(() => new Set(config.pinnedLists ?? []), [config.pinnedLists]);

  const header = (
    <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
      {sidebarItemIcon('lists', 'size-5')}
      <h1 className="text-lg font-bold flex-1">Lists</h1>
      <KindInfoButton kindDef={listsDef} icon={sidebarItemIcon('lists', 'size-10')} />
    </div>
  );

  return (
    <main className="flex-1 min-w-0">
      {header}

      {/* My Lists section (logged in only) */}
      {user && (
        <div>
          <div className="flex items-center justify-between px-4 py-3">
            <h2 className="text-[15px] font-bold">My Lists</h2>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" />
              New List
            </Button>
          </div>

          {lists.length === 0 ? (
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              You haven't created any lists yet. Create one to curate your own timeline.
            </div>
          ) : (
            <div className="grid gap-3 px-4 pb-4">
              {lists.map((list) => (
                <MyListCard
                  key={list.dTag}
                  dTag={list.dTag}
                  title={list.title}
                  description={list.description}
                  pubkeys={list.pubkeys}
                  authorPubkey={user.pubkey}
                  isPinned={pinnedSet.has(list.dTag)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <CreateListDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}

function MyListCard({ dTag, title, description, pubkeys, authorPubkey, isPinned }: {
  dTag: string;
  title: string;
  description: string;
  pubkeys: string[];
  authorPubkey: string;
  isPinned: boolean;
}) {
  const navigate = useNavigate();
  const previewPubkeys = useMemo(() => pubkeys.slice(0, 8), [pubkeys]);
  const { data: membersMap } = useAuthors(previewPubkeys);

  const naddr = useMemo(
    () => nip19.naddrEncode({ kind: 30000, pubkey: authorPubkey, identifier: dTag }),
    [dTag, authorPubkey],
  );

  return (
    <div
      className="rounded-xl border border-border p-4 hover:bg-secondary/30 transition-colors cursor-pointer"
      onClick={() => navigate(`/${naddr}`)}
    >
      <div className="flex items-center gap-2.5">
        <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <List className="size-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[15px] truncate">{title}</span>
            {isPinned && <Pin className="size-3.5 text-primary shrink-0" />}
          </div>
          <span className="text-xs text-muted-foreground">
            {pubkeys.length} member{pubkeys.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {description && (
        <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{description}</p>
      )}

      {pubkeys.length > 0 && (
        <div className="flex items-center gap-2 mt-3">
          <div className="flex -space-x-2">
            {previewPubkeys.map((pk) => {
              const member = membersMap?.get(pk);
              const name = member?.metadata?.name || genUserName(pk);
              return (
                <Avatar key={pk} className="size-7 border-2 border-background">
                  <AvatarImage src={member?.metadata?.picture} alt={name} />
                  <AvatarFallback className="bg-primary/20 text-primary text-[10px]">
                    {name[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              );
            })}
          </div>
          {pubkeys.length > previewPubkeys.length && (
            <span className="text-xs text-muted-foreground">+{pubkeys.length - previewPubkeys.length} more</span>
          )}
        </div>
      )}
    </div>
  );
}
