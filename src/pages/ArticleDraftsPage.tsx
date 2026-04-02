import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { nip19 } from 'nostr-tools';
import {
  FileText,
  Trash2,
  Clock,
  ChevronRight,
  Cloud,
  HardDrive,
  Loader2,
  CheckCircle2,
  BookOpen,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import { PageHeader } from '@/components/PageHeader';
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { TabButton } from '@/components/TabButton';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useDrafts, type Draft } from '@/hooks/useDrafts';
import { usePublishedArticles } from '@/hooks/usePublishedArticles';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { toast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface LocalDraft extends Draft {
  isLocal: true;
}

interface RelayDraft extends Draft {
  isLocal: false;
}

type CombinedDraft = LocalDraft | RelayDraft;

const DRAFTS_KEY = 'article-drafts';

export function ArticleDraftsPage() {
  const navigate = useNavigate();
  const { user } = useCurrentUser();

  // Go back to wherever the user came from; fall back to /articles
  const handleBack = useMemo(() => {
    return () => window.history.length > 1 ? navigate(-1) : navigate('/articles');
  }, [navigate]);
  const { drafts: relayDrafts, isLoading, deleteDraft, isDeleting } = useDrafts();
  const { articles: publishedArticles, isLoading: isLoadingArticles } = usePublishedArticles();
  const [localDrafts, setLocalDrafts] = useState<Draft[]>([]);
  const [activeTab, setActiveTab] = useState<'drafts' | 'published'>('drafts');
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    slug: string;
    isLocal: boolean;
  } | null>(null);

  useLayoutOptions({ showFAB: false, hasSubHeader: true });

  const loadLocalDrafts = useCallback(() => {
    try {
      const stored = localStorage.getItem(DRAFTS_KEY);
      if (stored) {
        setLocalDrafts(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load local drafts:', error);
    }
  }, []);

  useEffect(() => {
    loadLocalDrafts();
  }, [loadLocalDrafts]);

  // Combine relay and local drafts, avoiding duplicates by slug
  const combinedDrafts: CombinedDraft[] = (() => {
    const drafts: CombinedDraft[] = [];
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
  })();

  const handleSelectDraft = (draft: CombinedDraft) => {
    if (draft.isLocal) {
      navigate(`/articles/new?draft=${encodeURIComponent(draft.slug)}`);
    } else {
      // For relay drafts, navigate with slug as query param (the editor will fetch it)
      navigate(`/articles/new?draft=${encodeURIComponent(draft.slug)}`);
    }
  };

  const handleSelectArticle = (article: { slug: string; tags: string[] }) => {
    if (!user) return;
    const naddr = nip19.naddrEncode({
      kind: 30023,
      pubkey: user.pubkey,
      identifier: article.slug,
    });
    navigate(`/articles/edit/${naddr}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.isLocal) {
      try {
        const stored = localStorage.getItem(DRAFTS_KEY);
        if (stored) {
          const drafts: Draft[] = JSON.parse(stored);
          const filtered = drafts.filter((d) => d.id !== deleteTarget.id);
          localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
          setLocalDrafts(filtered);
        }
      } catch (error) {
        console.error('Failed to delete local draft:', error);
      }
      toast({
        title: 'Draft deleted',
        description: 'The draft has been removed from your browser.',
      });
    } else {
      try {
        await deleteDraft(deleteTarget.slug);
        toast({
          title: 'Draft deleted',
          description: 'The draft deletion event has been published to relays.',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        toast({
          title: 'Delete failed',
          description: message || 'Could not delete draft from relays.',
          variant: 'destructive',
        });
      }
    }
    setDeleteTarget(null);
  };

  const totalDrafts = combinedDrafts.length;

  return (
    <>
      <PageHeader
        title="Your Articles"
        icon={<BookOpen className="size-5" />}
        onBack={handleBack}
        alwaysShowBack
      />

      <SubHeaderBar>
        <TabButton
          label={`Drafts${totalDrafts > 0 ? ` (${totalDrafts})` : ''}`}
          active={activeTab === 'drafts'}
          onClick={() => setActiveTab('drafts')}
        />
        <TabButton
          label={`Published${publishedArticles.length > 0 ? ` (${publishedArticles.length})` : ''}`}
          active={activeTab === 'published'}
          onClick={() => setActiveTab('published')}
        />
      </SubHeaderBar>

      <div className="px-4 py-4">
        {activeTab === 'drafts' && (
          <>
            {isLoading && user ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Loading drafts...</p>
              </div>
            ) : totalDrafts === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No drafts yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Your saved drafts will appear here
                </p>
                <Button
                  className="mt-4"
                  onClick={() => navigate('/articles/new')}
                >
                  Write an article
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {combinedDrafts.map((draft) => (
                  <div
                    key={draft.id}
                    className={cn(
                      'group p-4 rounded-xl border border-border',
                      'hover:border-primary/30 hover:bg-card transition-all cursor-pointer',
                    )}
                    onClick={() => handleSelectDraft(draft)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium truncate">
                          {draft.title || 'Untitled Draft'}
                        </h3>
                        {draft.summary && (
                          <p className="text-sm text-muted-foreground truncate mt-1">
                            {draft.summary}
                          </p>
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
                      <span>
                        {formatDistanceToNow(draft.updatedAt, { addSuffix: true })}
                      </span>
                      {draft.tags.length > 0 && (
                        <>
                          <span>·</span>
                          <span>{draft.tags.length} tags</span>
                        </>
                      )}
                      <span className="flex-1" />
                      <button
                        className="p-1 rounded-full text-muted-foreground hover:text-destructive transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget({
                            id: draft.id,
                            slug: draft.slug,
                            isLocal: draft.isLocal,
                          });
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === 'published' && (
          <>
            {isLoadingArticles && user ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Loading articles...</p>
              </div>
            ) : !user ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Sign in to see your articles</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Your published articles will appear here
                </p>
              </div>
            ) : publishedArticles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <CheckCircle2 className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No published articles yet</p>
                <p className="text-sm text-muted-foreground/70 mt-1">
                  Your published articles will appear here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {publishedArticles.map((article) => (
                  <div
                    key={article.id}
                    className={cn(
                      'group relative p-4 rounded-xl border border-border',
                      'hover:border-green-500/30 hover:bg-card transition-all cursor-pointer',
                    )}
                    onClick={() => handleSelectArticle(article)}
                  >
                    <div className="pr-8">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium truncate flex-1">
                          {article.title || 'Untitled Article'}
                        </h3>
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      </div>
                      {article.summary && (
                        <p className="text-sm text-muted-foreground truncate mt-1">
                          {article.summary}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>
                          Published{' '}
                          {formatDistanceToNow(article.publishedAt, {
                            addSuffix: true,
                          })}
                        </span>
                        {article.tags.length > 0 && (
                          <>
                            <span>·</span>
                            <span>{article.tags.length} tags</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isLocal
                ? 'This action cannot be undone. The draft will be permanently deleted from your browser.'
                : 'This action cannot be undone. The draft will be deleted from Nostr relays.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
