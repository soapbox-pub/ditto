import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import {
  ArrowLeft,
  Image,
  Save,
  Send,
  Loader2,
  Hash,
  FileText,
  X,
  Clock,
  Cloud,
  HardDrive,
  Trash2,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import slugify from 'slugify';
import { useNostr } from '@nostrify/react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { SubHeaderBar } from '@/components/SubHeaderBar';
import { ARC_OVERHANG_PX } from '@/components/ArcBackground';
import { TabButton } from '@/components/TabButton';
import { FabButton } from '@/components/FabButton';
import { toast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDrafts, type Draft } from '@/hooks/useDrafts';
import { usePublishedArticles } from '@/hooks/usePublishedArticles';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useIsMobile } from '@/hooks/useIsMobile';
import { saveDraft as saveLocalDraft, deleteDraftBySlug, deleteLocalDraftById, getLocalDrafts } from '@/lib/localDrafts';
import type { ArticleFields } from '@/lib/articleHelpers';
import { MilkdownEditor } from './MilkdownEditor';

export type ArticleData = ArticleFields;

interface ArticleEditorProps {
  /** Pre-filled data for editing an existing article or loading a draft. */
  initialData?: Partial<ArticleData> & { publishedAt?: number };
  /** Whether the editor is in edit mode (updating an existing article). */
  editMode?: boolean;
}

type EditorTab = 'write' | 'drafts';

export function ArticleEditor({ initialData, editMode = false }: ArticleEditorProps) {
  const navigate = useNavigate();
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutate: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { drafts: relayDrafts, isLoading: isDraftsLoading, saveDraft: saveRelayDraft, isSaving: isSyncingToRelay, deleteDraft: deleteRelayDraft, isDeleting } = useDrafts();
  const { articles: publishedArticles } = usePublishedArticles();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('write');
  const [localDrafts, setLocalDrafts] = useState<Draft[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; slug: string; isLocal: boolean } | null>(null);
  const [tagInput, setTagInput] = useState('');
  const slugManuallyEdited = useRef(!!initialData?.slug);
  const [isPublished, setIsPublished] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(editMode);
  const [originalSlug, setOriginalSlug] = useState<string | null>(
    editMode && initialData?.slug ? initialData.slug : null,
  );
  const [originalPublishedAt, setOriginalPublishedAt] = useState<number | null>(
    initialData?.publishedAt ?? null,
  );
  const [metadataExpanded, setMetadataExpanded] = useState(false);
  const keyboardVisible = useKeyboardVisible();
  const isMobile = useIsMobile();

  const [article, setArticle] = useState<ArticleData>({
    title: initialData?.title || '',
    summary: initialData?.summary || '',
    content: initialData?.content || '',
    image: initialData?.image || '',
    tags: initialData?.tags || [],
    slug: initialData?.slug || '',
  });

  // Keep a ref to the latest article data so the auto-save timer doesn't
  // need `article` in its dependency array (which would reset it on every keystroke).
  const articleRef = useRef(article);
  articleRef.current = article;
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  /** Save draft to relay (with localStorage fallback). Shared by manual save + auto-save.
   *  Always saves locally first so the draft appears immediately in "My Articles",
   *  then syncs to the relay in the background. */
  const persistDraft = useCallback(async (data: ArticleData, { silent }: { silent?: boolean } = {}) => {
    // Always persist locally so the draft is visible immediately
    saveLocalDraft(data);
    setLocalDrafts(getLocalDrafts());

    // Mark as saved immediately after the local write — the relay sync
    // happens in the background and shouldn't leave the "unsaved" dot visible.
    setLastSaved(new Date());
    setHasUnsavedChanges(false);

    if (user) {
      try {
        await saveRelayDraft(data);
        if (!mountedRef.current) return;
        if (!silent) {
          toast({ title: 'Draft saved', description: 'Your article has been saved to Nostr relays.' });
        }
      } catch (error) {
        console.error('Failed to save draft to relay:', error);
        if (!mountedRef.current) return;
        if (!silent) {
          toast({ title: 'Draft saved locally', description: 'Could not sync to relays. Saved to your browser.', variant: 'destructive' });
        }
      }
    } else if (!silent) {
      toast({ title: 'Draft saved', description: 'Your article has been saved locally.' });
    }
  }, [user, saveRelayDraft]);

  // Auto-save 30s after the first unsaved change. The timer starts once and
  // is only reset when `hasUnsavedChanges` transitions, not on every keystroke.
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    autoSaveTimeoutRef.current = setTimeout(() => {
      const current = articleRef.current;
      if (current.content.length === 0) return;
      persistDraft(current, { silent: true });
    }, 30000);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, persistDraft]);

  /** Silently save the current draft on blur — uses the ref so it's always current. */
  const handleBlurSave = useCallback(() => {
    const current = articleRef.current;
    if (!current.title && !current.content) return;
    persistDraft(current, { silent: true });
  }, [persistDraft]);

  // Reference to handlers for keyboard shortcuts
  const handlePublishRef = useRef<(() => void) | null>(null);
  const handleSaveDraftRef = useRef<(() => void) | null>(null);

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && (article.title || article.content)) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, article.title, article.content]);

  // Auto-generate slug from title (skip if user manually edited the slug)
  useEffect(() => {
    if (article.title && !slugManuallyEdited.current) {
      const newSlug = slugify(article.title, {
        lower: true,
        strict: true,
        trim: true,
      });
      setArticle((prev) => ({ ...prev, slug: newSlug }));
    }
  }, [article.title]);

  // Derived stats
  const wordCount = useMemo(() => article.content.trim().split(/\s+/).filter(Boolean).length, [article.content]);
  const readingTime = Math.ceil(wordCount / 200);

  // Load local drafts when drafts tab is shown
  useEffect(() => {
    if (activeTab === 'drafts') {
      setLocalDrafts(getLocalDrafts());
    }
  }, [activeTab]);

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

  /** Load a draft or published article into the editor. */
  const handleLoadItem = useCallback((item: ArticleData & { publishedAt?: number }, isPublishedArticle: boolean) => {
    setArticle({
      title: item.title,
      summary: item.summary,
      content: item.content,
      image: item.image,
      tags: item.tags,
      slug: item.slug,
    });
    slugManuallyEdited.current = !!item.slug;
    setIsEditMode(isPublishedArticle);
    setOriginalSlug(isPublishedArticle ? item.slug : null);
    setOriginalPublishedAt(item.publishedAt ?? null);
    setHasUnsavedChanges(false);
    setActiveTab('write');
    toast({
      title: isPublishedArticle ? 'Article loaded for editing' : 'Draft loaded',
      description: isPublishedArticle
        ? 'Make changes and publish to update your article.'
        : 'Your draft has been loaded into the editor.',
    });
  }, []);

  const handleDeleteDraft = useCallback(async () => {
    if (!deleteTarget) return;

    if (deleteTarget.isLocal) {
      setLocalDrafts(deleteLocalDraftById(deleteTarget.id));
      toast({ title: 'Draft deleted', description: 'Removed from your browser.' });
    } else {
      try {
        await deleteRelayDraft(deleteTarget.slug);
        toast({ title: 'Draft deleted', description: 'Deletion published to relays.' });
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        toast({ title: 'Delete failed', description: message || 'Could not delete draft.', variant: 'destructive' });
      }
    }
    setDeleteTarget(null);
  }, [deleteTarget, deleteRelayDraft]);

  const updateArticle = useCallback(
    (field: keyof ArticleData, value: string | string[]) => {
      setArticle((prev) => ({ ...prev, [field]: value }));
      setHasUnsavedChanges(true);
    },
    [],
  );

  const handleAddTag = useCallback(() => {
    const newTag = tagInput.trim().toLowerCase().replace(/^#/, '');
    if (newTag && !article.tags.includes(newTag)) {
      setArticle((prev) => ({ ...prev, tags: [...prev.tags, newTag] }));
      setTagInput('');
    }
  }, [tagInput, article.tags]);

  const handleRemoveTag = useCallback((tagToRemove: string) => {
    setArticle((prev) => ({
      ...prev,
      tags: prev.tags.filter((tag) => tag !== tagToRemove),
    }));
  }, []);

  const handleImageUpload = useCallback(
    async (file: File) => {
      try {
        const [[, url]] = await uploadFile(file);
        return url;
      } catch (error) {
        console.error('Upload failed:', error);
        toast({
          title: 'Upload failed',
          description: 'Could not upload the image. Please try again.',
          variant: 'destructive',
        });
        return null;
      }
    },
    [uploadFile],
  );

  const handleHeaderImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = await handleImageUpload(file);
      if (url) {
        updateArticle('image', url);
        toast({
          title: 'Image uploaded',
          description: 'Header image has been set successfully.',
        });
      }
    },
    [handleImageUpload, updateArticle],
  );

  const handleSaveDraft = useCallback(async () => {
    await persistDraft(article);
  }, [article, persistDraft]);

  /** Perform the actual publish (called directly or after overwrite confirmation). */
  const doPublish = useCallback(() => {
    if (!user) return;

    // Use original published_at when editing, current time for new articles
    const publishedAtTimestamp =
      isEditMode && originalPublishedAt
        ? Math.floor(originalPublishedAt / 1000)
        : Math.floor(Date.now() / 1000);

    const tags: string[][] = [
      ['d', article.slug || slugify(article.title, { lower: true, strict: true })],
      ['title', article.title],
      ['published_at', publishedAtTimestamp.toString()],
    ];

    if (article.summary) {
      tags.push(['summary', article.summary]);
    }

    if (article.image) {
      tags.push(['image', article.image]);
    }

    article.tags.forEach((tag) => {
      tags.push(['t', tag]);
    });

    publishEvent(
      {
        kind: 30023,
        content: article.content,
        tags,
      },
      {
        onSuccess: async () => {
          setIsPublished(true);
          setHasUnsavedChanges(false);

          // Remove draft after publishing
          if (article.slug) {
            deleteDraftBySlug(article.slug);
            try {
              await deleteRelayDraft(article.slug);
            } catch (error) {
              console.error('Failed to delete draft from relay:', error);
            }
          }

          toast({
            title: isEditMode ? 'Article updated' : 'Article published',
            description: isEditMode
              ? 'Your article has been updated on Nostr.'
              : 'Your article is now live on Nostr.',
          });

          // Navigate back to articles feed
          navigate('/articles');
        },
        onError: (error) => {
          toast({
            title: 'Publishing failed',
            description:
              error.message || 'Could not publish your article. Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  }, [
    user,
    article,
    publishEvent,
    deleteRelayDraft,
    isEditMode,
    originalPublishedAt,
    navigate,
  ]);

  const handlePublish = useCallback(async () => {
    if (!user) {
      toast({
        title: 'Login required',
        description: 'Please login to publish your article.',
        variant: 'destructive',
      });
      return;
    }

    if (!article.title.trim()) {
      toast({
        title: 'Title required',
        description: 'Please add a title to your article.',
        variant: 'destructive',
      });
      return;
    }

    if (!article.content.trim()) {
      toast({
        title: 'Content required',
        description: 'Please write some content for your article.',
        variant: 'destructive',
      });
      return;
    }

    // Collision check: only block when the slug would overwrite a *different*
    // published article. When editing an existing article with the same slug
    // we're intentionally updating it, so skip the check.
    const slug = article.slug || slugify(article.title, { lower: true, strict: true });
    if (slug !== originalSlug) {
      try {
        const existing = await nostr.query([
          { kinds: [30023], authors: [user.pubkey], '#d': [slug], limit: 1 },
        ]);

        if (existing.length > 0) {
          toast({
            title: 'Slug already in use',
            description: 'You already have a published article with this slug. Change the slug or edit the existing article from My Articles.',
            variant: 'destructive',
          });
          return;
        }
      } catch {
        // If the check fails (e.g. relay timeout), proceed anyway
      }
    }

    doPublish();
  }, [user, article, originalSlug, nostr, doPublish]);

  // Set refs for keyboard shortcuts
  handlePublishRef.current = handlePublish;
  handleSaveDraftRef.current = handleSaveDraft;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSaveDraftRef.current?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && user) {
        e.preventDefault();
        handlePublishRef.current?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [user]);

  // Handle back navigation with unsaved changes check
  const handleBack = useCallback(() => {
    if (hasUnsavedChanges && (article.title || article.content)) {
      setShowLeaveDialog(true);
    } else {
      navigate('/articles');
    }
  }, [hasUnsavedChanges, article.title, article.content, navigate]);

  const handleLeaveWithoutSaving = useCallback(() => {
    setShowLeaveDialog(false);
    navigate('/articles');
  }, [navigate]);

  const handleSaveAndLeave = useCallback(async () => {
    await handleSaveDraft();
    setShowLeaveDialog(false);
    navigate('/articles');
  }, [handleSaveDraft, navigate]);

  const statusLabel = isPublished ? (
    <span className="text-green-600 dark:text-green-400 text-sm">
      {isEditMode ? 'Updated' : 'Published'}
    </span>
  ) : isEditMode ? (
    hasUnsavedChanges ? (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        Editing
      </span>
    ) : (
      <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 text-sm">
        <Cloud className={`size-3.5 ${isSyncingToRelay ? 'animate-pulse' : ''}`} />
        Editing
      </span>
    )
  ) : hasUnsavedChanges ? (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      Unsaved
    </span>
  ) : lastSaved ? (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <Cloud className={`size-3.5 ${isSyncingToRelay ? 'animate-pulse' : ''}`} />
      Saved
    </span>
  ) : null;

  const totalDrafts = combinedDrafts.length;

  return (
    <div className="flex flex-col">
      {/* Header — not sticky on mobile in write mode so it scrolls away with content */}
      <div className={isMobile && activeTab === 'write' ? 'relative z-20' : 'sticky top-0 z-20'}>
        <SubHeaderBar pinned className={isMobile && activeTab === 'write' ? 'relative !static' : 'relative !top-0'}>
          <button
            onClick={handleBack}
            className="pl-3 pr-1 py-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="size-5" />
          </button>

          <TabButton
            label="New"
            active={activeTab === 'write'}
            onClick={() => setActiveTab('write')}
          />

          <TabButton
            label="My Articles"
            active={activeTab === 'drafts'}
            onClick={() => setActiveTab('drafts')}
          />
        </SubHeaderBar>
      </div>
      {/* Spacer for the arc overhang */}
      <div style={{ height: ARC_OVERHANG_PX }} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleHeaderImageUpload}
        className="hidden"
      />
      {/* ── New article tab ──────────────────────────────────────── */}
      {activeTab === 'write' && (
        <div className={`px-4 pb-24 space-y-4 sm:space-y-6 ${keyboardVisible ? 'py-2' : 'py-4 sm:py-6'}`}>
          {/* Header Image — hide when keyboard is visible on mobile */}
          {!(isMobile && keyboardVisible) && (
            <>
              {article.image ? (
                <div className="relative rounded-xl overflow-hidden group">
                  <img
                    src={article.image}
                    alt="Header"
                    className="w-full h-48 sm:h-64 object-cover"
                  />
                  {/* Desktop: centered overlay on hover */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Image className="w-4 h-4 mr-2" />
                      )}
                      Change Image
                    </Button>
                  </div>
                  {/* Mobile: persistent corner button */}
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute top-2 right-2 h-8 w-8 rounded-full shadow-md sm:hidden"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Image className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full h-32 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:border-primary/50 hover:text-primary/70 transition-colors"
                >
                  {isUploading ? (
                    <Loader2 className="w-8 h-8 animate-spin mb-2" />
                  ) : (
                    <Image className="w-8 h-8 mb-2" />
                  )}
                  <span className="text-sm">Add a header image</span>
                </button>
              )}
            </>
          )}

          {/* Title — always visible, slightly smaller when keyboard is up on mobile */}
          <input
            type="text"
            dir="auto"
            value={article.title}
            onChange={(e) => updateArticle('title', e.target.value)}
            onBlur={handleBlurSave}
            placeholder="Your article title..."
            className={`w-full font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 ${
              isMobile && keyboardVisible ? 'text-xl' : 'text-3xl sm:text-4xl'
            }`}
          />

          {/* Metadata — collapsible on mobile, always expanded on desktop */}
          {isMobile ? (
            <>
              <button
                type="button"
                onClick={() => setMetadataExpanded((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${metadataExpanded ? 'rotate-0' : '-rotate-90'}`} />
                <span>Details</span>
                {(article.summary || article.tags.length > 0) && (
                  <span className="text-muted-foreground/60">
                    ({[article.summary && 'summary', article.tags.length > 0 && `${article.tags.length} tags`].filter(Boolean).join(', ')})
                  </span>
                )}
              </button>
              {metadataExpanded && (
                <div className="space-y-3 animate-in slide-in-from-top-1 duration-200">
                  <div className="space-y-1.5">
                    <Label htmlFor="summary" className="text-muted-foreground text-xs">Summary</Label>
                    <Textarea
                      id="summary"
                      dir="auto"
                      value={article.summary}
                      onChange={(e) => updateArticle('summary', e.target.value)}
                      placeholder="A brief description of your article..."
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="slug" className="text-muted-foreground text-xs leading-none">URL Slug</Label>
                    <Input
                      id="slug"
                      value={article.slug}
                      onChange={(e) => {
                        slugManuallyEdited.current = true;
                        updateArticle('slug', e.target.value);
                      }}
                      placeholder="article-url-slug"
                      className="h-8 font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-muted-foreground text-xs inline-flex items-center gap-1 leading-none">
                      <Hash className="w-3 h-3 shrink-0" />
                      Tags
                    </Label>
                    <div className="flex gap-1.5">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === 'Enter' && (e.preventDefault(), handleAddTag())
                        }
                        placeholder="Add a tag..."
                        className="h-8 text-xs flex-1"
                      />
                      <Button type="button" variant="secondary" size="icon" className="h-8 w-8 shrink-0" onClick={handleAddTag}>
                        <span className="text-base leading-none">+</span>
                      </Button>
                    </div>
                  </div>

                  {article.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {article.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="gap-1 px-2 py-0.5 text-xs">
                          #{tag}
                          <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-destructive">
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="summary" className="text-muted-foreground text-sm">Summary</Label>
                <Textarea
                  id="summary"
                  dir="auto"
                  value={article.summary}
                  onChange={(e) => updateArticle('summary', e.target.value)}
                  placeholder="A brief description of your article..."
                  rows={2}
                  className="resize-none"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="space-y-1.5 flex-1">
                  <Label htmlFor="slug" className="text-muted-foreground text-xs leading-none">URL Slug</Label>
                  <Input
                    id="slug"
                    value={article.slug}
                    onChange={(e) => {
                      slugManuallyEdited.current = true;
                      updateArticle('slug', e.target.value);
                    }}
                    placeholder="article-url-slug"
                    className="h-8 font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-muted-foreground text-xs inline-flex items-center gap-1 leading-none">
                    <Hash className="w-3 h-3 shrink-0" />
                    Tags
                  </Label>
                  <div className="flex gap-1.5">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === 'Enter' && (e.preventDefault(), handleAddTag())
                      }
                      placeholder="Add a tag..."
                      className="h-8 text-xs flex-1"
                    />
                    <Button type="button" variant="secondary" size="icon" className="h-8 w-8 shrink-0" onClick={handleAddTag}>
                      <span className="text-base leading-none">+</span>
                    </Button>
                  </div>
                </div>
              </div>

              {article.tags.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {article.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1 px-2 py-1">
                      #{tag}
                      <button onClick={() => handleRemoveTag(tag)} className="ml-1 hover:text-destructive">
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Editor */}
          <MilkdownEditor
            value={article.content}
            onChange={(value) => updateArticle('content', value || '')}
            onBlur={handleBlurSave}
            onUploadImage={handleImageUpload}
            placeholder="Start writing your article..."
            className={`rounded-xl border border-border bg-card ${
              isMobile && keyboardVisible ? 'min-h-[150px]' : 'min-h-[250px] sm:min-h-[400px]'
            }`}
          />

          {/* Stats + Save — hide when keyboard is visible on mobile */}
          {!(isMobile && keyboardVisible) && (
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
                <span className="shrink-0">{wordCount} words</span>
                <span>·</span>
                <span className="shrink-0">{readingTime} min read</span>
                {statusLabel && (
                  <>
                    <span>·</span>
                    {statusLabel}
                  </>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveDraft}
                className="rounded-full gap-1.5 shrink-0"
              >
                <Save className="size-3.5" />
                Save Draft
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Drafts tab ───────────────────────────────────────────── */}
      {activeTab === 'drafts' && (
        <div className="px-4 py-4">
          {isDraftsLoading && user ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Loading drafts...</p>
            </div>
          ) : totalDrafts === 0 && publishedArticles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <FileText className="w-8 h-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">No drafts or articles yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                Save a draft or publish to see content here
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Drafts section */}
              {totalDrafts > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground px-1">Drafts ({totalDrafts})</h3>
                  {combinedDrafts.map((draft) => (
                    <div
                      key={draft.id}
                      className="group p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-card transition-all cursor-pointer"
                      onClick={() => handleLoadItem(draft, false)}
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
                        <span>{formatDistanceToNow(draft.updatedAt, { addSuffix: true })}</span>
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

              {/* Published articles section */}
              {publishedArticles.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-muted-foreground px-1">Published ({publishedArticles.length})</h3>
                  {publishedArticles.map((pub) => (
                    <div
                      key={pub.id}
                      className="group p-4 rounded-xl border border-border hover:border-green-500/30 hover:bg-card transition-all cursor-pointer"
                      onClick={() => handleLoadItem(pub, true)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate">
                            {pub.title || 'Untitled Article'}
                          </h3>
                          {pub.summary && (
                            <p className="text-sm text-muted-foreground truncate mt-1">
                              {pub.summary}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Published {formatDistanceToNow(pub.publishedAt, { addSuffix: true })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Publish FAB — mobile: fixed bottom right, hidden when keyboard is up */}
      {!keyboardVisible && (
        <div className="fixed bottom-fab right-6 z-30 sidebar:hidden">
          <FabButton
            onClick={handlePublish}
            disabled={isPublishing || !user}
            title={isEditMode ? 'Update article' : 'Publish article'}
            icon={isPublishing
              ? <Loader2 size={18} className="animate-spin" />
              : <Send strokeWidth={3} size={18} />
            }
          />
        </div>
      )}
      {/* Publish FAB — desktop: sticky within column */}
      <div className="hidden sidebar:block sticky bottom-6 z-30 pointer-events-none">
        <div className="flex justify-end pr-4">
          <div className="pointer-events-auto">
            <FabButton
              onClick={handlePublish}
              disabled={isPublishing || !user}
              title={isEditMode ? 'Update article' : 'Publish article'}
              icon={isPublishing
                ? <Loader2 size={18} className="animate-spin" />
                : <Send strokeWidth={3} size={18} />
              }
            />
          </div>
        </div>
      </div>

      {/* Leave Confirmation Dialog */}
      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Would you like to save your draft before
              leaving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <Button variant="outline" onClick={handleLeaveWithoutSaving}>
              Discard
            </Button>
            <AlertDialogAction onClick={handleSaveAndLeave}>
              Save Draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Draft Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.isLocal
                ? 'This draft will be permanently deleted from your browser.'
                : 'This draft will be deleted from Nostr relays.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteDraft}
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
    </div>
  );
}
