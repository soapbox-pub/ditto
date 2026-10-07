import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { FormattedMessage, useIntl } from 'react-intl';
import { Loader2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToastAction } from '@/components/ui/toast';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTheme } from '@/hooks/useTheme';
import { toast } from '@/hooks/useToast';
import { useRehostFile } from '@/hooks/useUploadFile';
import { getDisplayName } from '@/lib/getDisplayName';
import { clearThemePreview, useThemePreview } from '@/lib/themePreview';
import type { ThemeConfig } from '@/themes';

/**
 * Confirm bar for a theme the user is trying on. Previewing changes nothing
 * stored; only "Use this theme" adopts it (and so signs the profile theme).
 * Offers to copy a borrowed background onto the user's own Blossom servers so
 * the theme's creator can't later change or delete it out from under them.
 */
export function ThemePreviewBar() {
  const intl = useIntl();
  const preview = useThemePreview();
  const { pathname } = useLocation();
  const { user } = useCurrentUser();
  const { theme, customTheme, setTheme, applyCustomTheme } = useTheme();
  const rehost = useRehostFile();
  const [keepBackground, setKeepBackground] = useState(true);

  const config = preview?.config;
  const source = config?.source && config.source.pubkey !== user?.pubkey ? config.source : undefined;
  const author = useAuthor(source?.pubkey);
  const authorName = source
    ? getDisplayName(author.data?.metadata, source.pubkey)
    : undefined;
  const offerRehost = !!user && !!source && !!config?.background;

  // A preview belongs to the page it was started on.
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname !== firstPath.current) {
      firstPath.current = pathname;
      clearThemePreview();
    }
  }, [pathname]);

  useEffect(() => {
    if (!preview) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') clearThemePreview();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [preview]);

  if (!preview || !config) return null;

  const title = config.title || intl.formatMessage({ id: 'themePreview.untitled', defaultMessage: 'Untitled theme' });

  const handleUse = async () => {
    let adopted: ThemeConfig = { ...config, source };

    if (offerRehost && keepBackground && adopted.background) {
      try {
        const url = await rehost.mutateAsync(adopted.background.url);
        adopted = { ...adopted, background: { ...adopted.background, url } };
      } catch (error) {
        console.error('Failed to copy theme background:', error);
        toast({
          variant: 'destructive',
          title: intl.formatMessage({ id: 'themePreview.rehostFailed', defaultMessage: "Couldn't copy the background" }),
          description: intl.formatMessage({ id: 'themePreview.rehostFailedDescription', defaultMessage: 'The theme still links to its creator\'s copy.' }),
        });
      }
    }

    const previous = { mode: theme, config: customTheme };
    applyCustomTheme(adopted);
    clearThemePreview();

    const undo = () => {
      if (previous.mode === 'custom' && previous.config) {
        applyCustomTheme(previous.config);
      } else {
        setTheme(previous.mode);
      }
    };

    toast({
      title: intl.formatMessage({ id: 'themePreview.applied', defaultMessage: 'Theme applied' }),
      description: authorName
        ? intl.formatMessage(
          { id: 'themePreview.appliedByDescription', defaultMessage: 'You\'re now using "{title}" by {author}.' },
          { title, author: authorName },
        )
        : intl.formatMessage(
          { id: 'themePreview.appliedDescription', defaultMessage: 'You\'re now using "{title}".' },
          { title },
        ),
      action: (
        <ToastAction
          altText={intl.formatMessage({ id: 'themePreview.undoAlt', defaultMessage: 'Undo theme change' })}
          onClick={undo}
        >
          <FormattedMessage id="themePreview.undo" defaultMessage="Undo" />
        </ToastAction>
      ),
    });
  };

  return (
    <div className="fixed inset-x-0 z-50 flex justify-center px-4 pointer-events-none bottom-mobile-nav sidebar:!bottom-6">
      <div
        role="region"
        aria-label={intl.formatMessage({ id: 'themePreview.label', defaultMessage: 'Theme preview' })}
        className="pointer-events-auto w-full max-w-md rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
      >
        <div className="flex items-start gap-3">
          <Sparkles className="size-5 mt-0.5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold truncate">
              {preview.live
                ? <FormattedMessage id="themePreview.previewing" defaultMessage="Previewing {title}" values={{ title }} />
                : title}
            </p>
            {authorName && (
              <p className="text-xs text-muted-foreground truncate">
                <FormattedMessage id="themePreview.byAuthor" defaultMessage="by {author}" values={{ author: authorName }} />
              </p>
            )}
          </div>
        </div>

        {offerRehost && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <Label htmlFor="theme-preview-keep-background" className="text-sm font-normal cursor-pointer">
              <FormattedMessage id="themePreview.keepBackground" defaultMessage="Keep my own copy of the background" />
            </Label>
            <Switch
              id="theme-preview-keep-background"
              checked={keepBackground}
              onCheckedChange={setKeepBackground}
            />
          </div>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={clearThemePreview} disabled={rehost.isPending}>
            <FormattedMessage id="themePreview.cancel" defaultMessage="Cancel" />
          </Button>
          <Button size="sm" onClick={handleUse} disabled={rehost.isPending}>
            {rehost.isPending && <Loader2 className="size-4 mr-1.5 animate-spin" aria-hidden />}
            <FormattedMessage id="themePreview.use" defaultMessage="Use this theme" />
          </Button>
        </div>
      </div>
    </div>
  );
}
