import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { formatDistanceToNow } from 'date-fns';
import { ChevronRight, Clock, Cloud, FileText, HardDrive, Loader2, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/useToast';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDrafts, type Draft } from '@/hooks/useDrafts';
import { usePublishedArticles } from '@/hooks/usePublishedArticles';
import { deleteLocalDraftById, getLocalDrafts } from '@/lib/localDrafts';

/** The current user's drafts (relay + local) and published articles. */
export function MyArticlesList() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { drafts: relayDrafts, isLoading: isDraftsLoading, deleteDraft: deleteRelayDraft, isDeleting } = useDrafts();
  const { articles: publishedArticles, isLoading: isPublishedLoading } = usePublishedArticles();

  const [localDrafts, setLocalDrafts] = useState<Draft[]>(() => getLocalDrafts());
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; slug: string; isLocal: boolean } | null>(null);

  // Combine relay and local drafts, avoiding duplicates by slug
  const combinedDrafts = useMemo(() => {
    const drafts: (Draft & { isLocal: boolean })[] = [];
    const seenSlugs = new Set<string>();

    for (const draft of relayDrafts) {
      if (draft.slug) seenSlugs.add(draft.slug);
      drafts.push({ ...draft, isLocal: false });
    }

    for (const draft of localDrafts) {
      if (!draft.slug || !seenSlugs.has(draft.slug)) {
        drafts.push({ ...draft, isLocal: true });
      }
    }

    return drafts.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [relayDrafts, localDrafts]);

  /** Open a draft in the editor. Local drafts without a slug are looked up by id. */
  const handleOpenDraft = useCallback((draft: Draft) => {
    navigate(`/articles/new?draft=${encodeURIComponent(draft.slug || draft.id)}`);
  }, [navigate]);

  /**
   * Published articles open on the dedicated edit route, which keeps the slug
   * fixed so publishing updates the article instead of colliding with it.
   */
  const handleEditPublished = useCallback((slug: string) => {
    if (!slug) return;
    navigate(`/articles/edit/${encodeURIComponent(slug)}`);
  }, [navigate]);

  const handleDeleteDraft = useCallback(async () => {
    if (!deleteTarget) return;

    if (deleteTarget.isLocal) {
      setLocalDrafts(deleteLocalDraftById(deleteTarget.id));
      toast({
        title: intl.formatMessage({ id: 'articles.mine.draftDeleted', defaultMessage: 'Draft deleted' }),
        description: intl.formatMessage({ id: 'articles.mine.draftDeletedLocal', defaultMessage: 'Removed from your browser.' }),
      });
    } else {
      try {
        await deleteRelayDraft(deleteTarget.slug);
        toast({
          title: intl.formatMessage({ id: 'articles.mine.draftDeleted', defaultMessage: 'Draft deleted' }),
          description: intl.formatMessage({ id: 'articles.mine.draftDeletedRelay', defaultMessage: 'Deletion published to relays.' }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        toast({
          title: intl.formatMessage({ id: 'articles.mine.deleteFailed', defaultMessage: 'Delete failed' }),
          description: message || intl.formatMessage({ id: 'articles.mine.deleteFailedDescription', defaultMessage: 'Could not delete draft.' }),
          variant: 'destructive',
        });
      }
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteRelayDraft, intl]);

  const totalDrafts = combinedDrafts.length;
  const isLoading = !!user && (isDraftsLoading || isPublishedLoading);

  return (
    <div className="px-4 py-4">
      {isLoading && totalDrafts === 0 && publishedArticles.length === 0 ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : totalDrafts === 0 && publishedArticles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground">
            <FormattedMessage id="articles.mine.empty" defaultMessage="No drafts or articles yet" />
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            <FormattedMessage id="articles.mine.emptyHint" defaultMessage="Save a draft or publish to see content here" />
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {totalDrafts > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground px-1">
                <FormattedMessage id="articles.mine.drafts" defaultMessage="Drafts ({count})" values={{ count: totalDrafts }} />
              </h3>
              {combinedDrafts.map((draft) => (
                <div
                  key={draft.id}
                  role="button"
                  tabIndex={0}
                  className="group p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-card transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handleOpenDraft(draft)}
                  onKeyDown={(e) => {
                    if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handleOpenDraft(draft);
                    }
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">
                        {draft.title || <FormattedMessage id="articles.mine.untitledDraft" defaultMessage="Untitled Draft" />}
                      </h3>
                      {draft.summary && (
                        <p className="text-sm text-muted-foreground truncate mt-1">{draft.summary}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    {draft.isLocal ? (
                      <HardDrive className="w-3 h-3 shrink-0" />
                    ) : (
                      <Cloud className="w-3 h-3 text-primary shrink-0" />
                    )}
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>{formatDistanceToNow(draft.updatedAt, { addSuffix: true })}</span>
                    {draft.tags.length > 0 && (
                      <>
                        <span>·</span>
                        <span>
                          <FormattedMessage
                            id="articles.mine.tagCount"
                            defaultMessage="{count, plural, one {# tag} other {# tags}}"
                            values={{ count: draft.tags.length }}
                          />
                        </span>
                      </>
                    )}
                    <span className="flex-1" />
                    <button
                      className="p-1 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                      aria-label={intl.formatMessage({ id: 'articles.mine.deleteDraft', defaultMessage: 'Delete draft' })}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget({ id: draft.id, slug: draft.slug, isLocal: draft.isLocal });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {publishedArticles.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground px-1">
                <FormattedMessage id="articles.mine.published" defaultMessage="Published ({count})" values={{ count: publishedArticles.length }} />
              </h3>
              {publishedArticles.map((pub) => (
                <button
                  key={pub.id}
                  type="button"
                  className="block w-full text-left group p-4 rounded-xl border border-border hover:border-green-500/30 hover:bg-card transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => handleEditPublished(pub.slug)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium truncate">
                        {pub.title || <FormattedMessage id="articles.mine.untitledArticle" defaultMessage="Untitled Article" />}
                      </h3>
                      {pub.summary && (
                        <p className="text-sm text-muted-foreground truncate mt-1">{pub.summary}</p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>
                      <FormattedMessage
                        id="articles.mine.publishedAgo"
                        defaultMessage="Published {ago}"
                        values={{ ago: formatDistanceToNow(pub.publishedAt, { addSuffix: true }) }}
                      />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <FormattedMessage id="articles.mine.deleteTitle" defaultMessage="Delete draft?" />
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isLocal ? (
                <FormattedMessage id="articles.mine.deleteLocalDescription" defaultMessage="This draft will be permanently deleted from your browser." />
              ) : (
                <FormattedMessage id="articles.mine.deleteRelayDescription" defaultMessage="This draft will be deleted from Nostr relays." />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              <FormattedMessage id="articles.mine.cancel" defaultMessage="Cancel" />
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDraft}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <FormattedMessage id="articles.mine.deleting" defaultMessage="Deleting..." />
                </>
              ) : (
                <FormattedMessage id="articles.mine.delete" defaultMessage="Delete" />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
