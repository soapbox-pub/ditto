import { useState, useCallback, useRef, useEffect } from 'react';
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
  Calendar,
  Clock,
  Cloud,
  HardDrive,
  Trash2,
  PenLine,
  Settings2,
  ChevronRight,
  BookOpen,
} from 'lucide-react';
import slugify from 'slugify';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
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
import { TabButton } from '@/components/TabButton';
import { FabButton } from '@/components/FabButton';
import { toast } from '@/hooks/useToast';
import { useUploadFile } from '@/hooks/useUploadFile';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useDrafts, type Draft } from '@/hooks/useDrafts';
import { usePublishedArticles } from '@/hooks/usePublishedArticles';
import { cn } from '@/lib/utils';
import { saveDraft as saveLocalDraft, deleteDraftBySlug, getLocalDrafts } from '@/lib/localDrafts';
import { MilkdownEditor } from './MilkdownEditor';

export interface ArticleData {
  title: string;
  summary: string;
  content: string;
  image: string;
  tags: string[];
  slug: string;
}

interface ArticleEditorProps {
  /** Pre-filled data for editing an existing article or loading a draft. */
  initialData?: Partial<ArticleData> & { publishedAt?: number };
  /** Whether the editor is in edit mode (updating an existing article). */
  editMode?: boolean;
}

type EditorTab = 'write' | 'details' | 'drafts';

export function ArticleEditor({ initialData, editMode = false }: ArticleEditorProps) {
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { mutate: publishEvent, isPending: isPublishing } = useNostrPublish();
  const { mutateAsync: uploadFile, isPending: isUploading } = useUploadFile();
  const { drafts: relayDrafts, isLoading: isDraftsLoading, saveDraft: saveRelayDraft, deleteDraft: deleteRelayDraft, isDeleting } = useDrafts();
  const { articles: publishedArticles, isLoading: isArticlesLoading } = usePublishedArticles();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const inlineImageInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeTab, setActiveTab] = useState<EditorTab>('write');
  const [localDrafts, setLocalDrafts] = useState<Draft[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; slug: string; isLocal: boolean } | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [readingTime, setReadingTime] = useState(0);
  const [tagInput, setTagInput] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [isEditMode, setIsEditMode] = useState(editMode);
  const [originalPublishedAt, setOriginalPublishedAt] = useState<number | null>(
    initialData?.publishedAt ?? null,
  );

  const [article, setArticle] = useState<ArticleData>({
    title: initialData?.title || '',
    summary: initialData?.summary || '',
    content: initialData?.content || '',
    image: initialData?.image || '',
    tags: initialData?.tags || [],
    slug: initialData?.slug || '',
  });

  // Auto-save every 30 seconds if there are changes
  useEffect(() => {
    if (hasUnsavedChanges && article.content.length > 0) {
      autoSaveTimeoutRef.current = setTimeout(async () => {
        if (user) {
          try {
            await saveRelayDraft(article);
          } catch {
            // Fallback to local
            saveLocalDraft(article);
          }
        } else {
          saveLocalDraft(article);
        }
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
      }, 30000);
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [hasUnsavedChanges, article, user, saveRelayDraft]);

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

  // Auto-generate slug from title
  useEffect(() => {
    if (article.title && !initialData?.slug) {
      const newSlug = slugify(article.title, {
        lower: true,
        strict: true,
        trim: true,
      });
      setArticle((prev) => ({ ...prev, slug: newSlug }));
    }
  }, [article.title, initialData?.slug]);

  // Calculate stats
  useEffect(() => {
    const words = article.content.trim().split(/\s+/).filter(Boolean).length;
    const chars = article.content.length;
    const minutes = Math.ceil(words / 200);

    setWordCount(words);
    setCharCount(chars);
    setReadingTime(minutes);
  }, [article.content]);

  // Load local drafts when drafts tab is shown
  useEffect(() => {
    if (activeTab === 'drafts') {
      setLocalDrafts(getLocalDrafts());
    }
  }, [activeTab]);

  // Combine relay and local drafts, avoiding duplicates by slug
  const combinedDrafts = (() => {
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
  })();

  const handleLoadDraft = useCallback((draft: Draft & { isLocal: boolean }) => {
    setArticle({
      title: draft.title,
      summary: draft.summary,
      content: draft.content,
      image: draft.image,
      tags: draft.tags,
      slug: draft.slug,
    });
    setIsEditMode(false);
    setOriginalPublishedAt(null);
    setHasUnsavedChanges(false);
    setActiveTab('write');
    toast({
      title: 'Draft loaded',
      description: 'Your draft has been loaded into the editor.',
    });
  }, []);

  const handleLoadArticle = useCallback((articleData: { title: string; summary: string; content: string; image: string; tags: string[]; slug: string; publishedAt: number }) => {
    setArticle({
      title: articleData.title,
      summary: articleData.summary,
      content: articleData.content,
      image: articleData.image,
      tags: articleData.tags,
      slug: articleData.slug,
    });
    setIsEditMode(true);
    setOriginalPublishedAt(articleData.publishedAt);
    setHasUnsavedChanges(false);
    setActiveTab('write');
    toast({
      title: 'Article loaded for editing',
      description: 'Make changes and publish to update your article.',
    });
  }, []);

  const handleDeleteDraft = useCallback(async () => {
    if (!deleteTarget) return;

    if (deleteTarget.isLocal) {
      try {
        const stored = localStorage.getItem('article-drafts');
        if (stored) {
          const drafts: Draft[] = JSON.parse(stored);
          const filtered = drafts.filter((d) => d.id !== deleteTarget.id);
          localStorage.setItem('article-drafts', JSON.stringify(filtered));
          setLocalDrafts(filtered);
        }
      } catch (error) {
        console.error('Failed to delete local draft:', error);
      }
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

  const handleInlineImageButtonClick = useCallback(() => {
    inlineImageInputRef.current?.click();
  }, []);

  const handleInlineImageUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const url = await handleImageUpload(file);
      if (url) {
        const imageMarkdown = `![${file.name}](${url})`;
        updateArticle('content', article.content + '\n' + imageMarkdown + '\n');
      }
      e.target.value = '';
    },
    [handleImageUpload, updateArticle, article.content],
  );

  const handleSaveDraft = useCallback(async () => {
    if (user) {
      try {
        await saveRelayDraft(article);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        toast({
          title: 'Draft saved',
          description: 'Your article has been saved to Nostr relays.',
        });
      } catch (error) {
        console.error('Failed to save draft to relay:', error);
        saveLocalDraft(article);
        setLastSaved(new Date());
        setHasUnsavedChanges(false);
        toast({
          title: 'Draft saved locally',
          description: 'Could not sync to relays. Saved to your browser.',
          variant: 'destructive',
        });
      }
    } else {
      saveLocalDraft(article);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
      toast({
        title: 'Draft saved',
        description: 'Your article has been saved locally.',
      });
    }
  }, [article, user, saveRelayDraft]);

  const handlePublish = useCallback(() => {
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

  // Sync editMode prop with internal state
  useEffect(() => {
    setIsEditMode(editMode);
  }, [editMode]);

  useEffect(() => {
    setOriginalPublishedAt(initialData?.publishedAt ?? null);
  }, [initialData?.publishedAt]);

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
      <span className="text-blue-600 dark:text-blue-400 text-sm">Editing</span>
    )
  ) : hasUnsavedChanges ? (
    <span className="flex items-center gap-1 text-sm text-muted-foreground">
      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
      Unsaved
    </span>
  ) : lastSaved ? (
    <span className="text-sm text-muted-foreground">Saved</span>
  ) : null;

  const totalDrafts = combinedDrafts.length;

  return (
    <div className="flex flex-col">
      {/* Sticky header — matches letters/compose pattern */}
      <div className="sticky top-0 z-20">
        <SubHeaderBar pinned className="relative !top-0">
          <button
            onClick={handleBack}
            className="pl-3 pr-1 py-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
          >
            <ArrowLeft className="size-5" />
          </button>

          <TabButton
            label="Write"
            active={activeTab === 'write'}
            onClick={() => setActiveTab('write')}
          >
            <PenLine className="h-5 w-5" strokeWidth={2.5} />
          </TabButton>

          <TabButton
            label="Details"
            active={activeTab === 'details'}
            onClick={() => setActiveTab('details')}
          >
            <Settings2 className="h-5 w-5" strokeWidth={2.5} />
          </TabButton>

          <TabButton
            label="Drafts"
            active={activeTab === 'drafts'}
            onClick={() => setActiveTab('drafts')}
          >
            <BookOpen className="h-5 w-5" strokeWidth={2.5} />
          </TabButton>

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleSaveDraft}
                className="pr-3 pl-1 py-1.5 text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <Save className="size-5" strokeWidth={2.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Save Draft (Ctrl+S)</TooltipContent>
          </Tooltip>
        </SubHeaderBar>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleHeaderImageUpload}
        className="hidden"
      />
      <input
        ref={inlineImageInputRef}
        type="file"
        accept="image/*"
        onChange={handleInlineImageUpload}
        className="hidden"
      />

      {/* ── Write tab ────────────────────────────────────────────── */}
      {activeTab === 'write' && (
        <div className="px-4 py-6">
          {/* Title Input */}
          <input
            type="text"
            value={article.title}
            onChange={(e) => updateArticle('title', e.target.value)}
            placeholder="Your article title..."
            className="w-full text-3xl sm:text-4xl font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground/40 mb-4"
          />

          {/* Editor */}
          <MilkdownEditor
            value={article.content}
            onChange={(value) => updateArticle('content', value || '')}
            onUploadImage={handleImageUpload}
            onImageButtonClick={handleInlineImageButtonClick}
            placeholder="Start writing your article..."
            className="rounded-xl overflow-hidden border border-border bg-card min-h-[400px]"
          />

          {/* Stats Bar */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>{wordCount} words</span>
            <span>·</span>
            <span>{charCount} chars</span>
            <span>·</span>
            <span>{readingTime} min read</span>
            {statusLabel && (
              <>
                <span>·</span>
                {statusLabel}
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Details tab ──────────────────────────────────────────── */}
      {activeTab === 'details' && (
        <div className="px-4 py-6 space-y-6">
          {/* Header Image */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Header Image</Label>
            {article.image ? (
              <div className="relative rounded-xl overflow-hidden group">
                <img
                  src={article.image}
                  alt="Header"
                  className="w-full h-48 sm:h-64 object-cover"
                />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
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
          </div>

          {/* URL Slug */}
          <div className="space-y-2">
            <Label htmlFor="slug" className="text-muted-foreground">URL Slug</Label>
            <Input
              id="slug"
              value={article.slug}
              onChange={(e) => updateArticle('slug', e.target.value)}
              placeholder="article-url-slug"
              className="font-mono text-sm"
            />
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="text-muted-foreground flex items-center gap-2">
              <Hash className="w-3.5 h-3.5" />
              Tags
            </Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) =>
                  e.key === 'Enter' && (e.preventDefault(), handleAddTag())
                }
                placeholder="Add a tag..."
                className="flex-1"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleAddTag}
              >
                Add
              </Button>
            </div>
            {article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {article.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1 px-2 py-1">
                    #{tag}
                    <button
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-1 hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-2">
            <Label htmlFor="summary" className="text-muted-foreground">Summary</Label>
            <Textarea
              id="summary"
              value={article.summary}
              onChange={(e) => updateArticle('summary', e.target.value)}
              placeholder="A brief description of your article..."
              rows={3}
              className="resize-none"
            />
          </div>
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
                      onClick={() => handleLoadDraft(draft)}
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
                      onClick={() => handleLoadArticle(pub)}
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

      {/* Publish FAB — mobile: fixed bottom right */}
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
