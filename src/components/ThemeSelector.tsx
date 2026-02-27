import { useState, useMemo, useCallback } from 'react';
import { Check, Palette } from 'lucide-react';
import { type Theme } from '@/contexts/AppContext';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePublishTheme } from '@/hooks/usePublishTheme';
import { useUserThemes } from '@/hooks/useUserThemes';
import { useToast } from '@/hooks/useToast';
import type { ThemeDefinition } from '@/lib/themeEvent';
import { themePresets, coreToTokens, resolveTheme, resolveThemeConfig, type CoreThemeColors, type ThemeTokens, type ThemeConfig, type ThemesConfig } from '@/themes';
import { hslStringToHex, hexToHslString } from '@/lib/colorUtils';
import { ColorPicker } from '@/components/ui/color-picker';
import { FontPicker } from '@/components/FontPicker';
import { BackgroundPicker } from '@/components/BackgroundPicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Extracts HSL color string from a theme token value like "258 70% 55%" */
function hsl(value: string): string {
  return `hsl(${value})`;
}

/** Core color keys exposed in the editor, in display order */
const CORE_KEYS: (keyof CoreThemeColors)[] = ['primary', 'text', 'background'];

/** Human-readable labels for core color keys */
const COLOR_LABELS: Record<keyof CoreThemeColors, string> = {
  primary: 'Primary',
  text: 'Text',
  background: 'Background',
};

/** Get the effective CoreThemeColors for the current theme */
function getEffectiveColors(theme: Theme, customTheme?: ThemeConfig, themes?: ThemesConfig): CoreThemeColors {
  if (theme === 'custom' && customTheme) return customTheme.colors;
  const resolved = resolveTheme(theme);
  if (resolved === 'custom') return customTheme?.colors ?? resolveThemeConfig('dark', themes).colors;
  return resolveThemeConfig(resolved, themes).colors;
}

/** Mini preview card for a theme with known tokens */
function ThemePreviewCard({
  colors,
  isActive,
  backgroundUrl,
  children,
}: {
  colors: CoreThemeColors;
  isActive: boolean;
  backgroundUrl?: string;
  children?: React.ReactNode;
}) {
  const tokens = useMemo(() => coreToTokens(colors), [colors]);

  return (
    <>
      {/* Mini preview */}
      <div
        className="aspect-[4/3] rounded-lg overflow-hidden relative"
        style={{ backgroundColor: hsl(tokens.background) }}
      >
        {/* Background image layer */}
        {backgroundUrl && (
          <img
            src={backgroundUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
          />
        )}
        {/* Simulated header bar */}
        <div
          className="h-2.5 w-full relative"
          style={{ backgroundColor: hsl(tokens.card) }}
        />
        {/* Content preview area */}
        <div className="p-1.5 space-y-1 relative">
          {/* Simulated text lines */}
          <div
            className="h-1 w-3/4 rounded-full"
            style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.6 }}
          />
          <div
            className="h-1 w-1/2 rounded-full"
            style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.4 }}
          />
          {/* Simulated button */}
          <div className="pt-0.5">
            <div
              className="h-2 w-8 rounded-sm"
              style={{ backgroundColor: hsl(tokens.primary) }}
            />
          </div>
        </div>
        {/* Simulated sidebar strip */}
        <div
          className="absolute right-0 top-0 bottom-0 w-4"
          style={{ backgroundColor: hsl(tokens.secondary) }}
        />

        {/* Active check mark */}
        {isActive && (
          <div className="absolute top-1 left-1 size-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: hsl(tokens.primary) }}
          >
            <Check className="size-2.5" style={{ color: hsl(tokens.primaryForeground) }} />
          </div>
        )}

        {children}
      </div>
    </>
  );
}

export function ThemeSelector() {
  const { theme, customTheme, themes, autoShareTheme, setTheme, applyCustomTheme, setAutoShareTheme } = useTheme();
  const { user } = useCurrentUser();
  const { publishTheme, isPending: isPublishing } = usePublishTheme();
  const { toast } = useToast();
  const userThemes = useUserThemes(user?.pubkey);

  // Editor mode: which user theme is being edited
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | null>(null);

  // Publish dialog state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');

  const builtinOptions: { id: Theme; label: string }[] = [
    { id: 'system', label: 'System' },
    { id: 'light', label: 'Light' },
    { id: 'dark', label: 'Dark' },
  ];

  const presetOptions = Object.entries(themePresets).map(([id, preset]) => ({
    id,
    label: preset.label,
    colors: preset.colors,
    font: preset.font,
    background: preset.background,
  }));

  /** Check if a preset matches the current custom theme colors */
  const isPresetActive = (presetColors: CoreThemeColors): boolean => {
    if (theme !== 'custom' || !customTheme) return false;
    return JSON.stringify(customTheme.colors) === JSON.stringify(presetColors);
  };

  /** Check if a user theme is the one currently being edited */
  const isUserThemeActive = (def: ThemeDefinition): boolean => {
    return editingTheme?.identifier === def.identifier && theme === 'custom';
  };

  /** The effective colors for the current theme (used in the color editor) */
  const effectiveColors = getEffectiveColors(theme, customTheme, themes);

  /** Handle a color change from the inline editor */
  const handleColorChange = useCallback((key: keyof CoreThemeColors, hex: string) => {
    const hslValue = hexToHslString(hex);
    const newColors = { ...effectiveColors, [key]: hslValue };
    applyCustomTheme({ ...customTheme, colors: newColors });
  }, [effectiveColors, applyCustomTheme, customTheme]);

  /** Select a builtin theme and exit editor mode */
  const handleSelectBuiltin = useCallback((id: Theme) => {
    setEditingTheme(null);
    setTheme(id);
  }, [setTheme]);

  /** Select a preset and exit editor mode */
  const handleSelectPreset = useCallback((preset: { colors: CoreThemeColors; font?: ThemeConfig['font']; background?: ThemeConfig['background'] }) => {
    setEditingTheme(null);
    applyCustomTheme({ colors: preset.colors, font: preset.font, background: preset.background });
  }, [applyCustomTheme]);

  /** Select a user-published theme: apply it and enter editor mode */
  const handleSelectUserTheme = useCallback((def: ThemeDefinition) => {
    setEditingTheme(def);
    applyCustomTheme({
      colors: def.colors,
      font: def.font,
      background: def.background,
      title: def.title,
    });
  }, [applyCustomTheme]);

  /** Open the publish dialog for a new theme */
  const handlePublishNew = useCallback(() => {
    setPublishTitle('');
    setPublishDescription('');
    setPublishDialogOpen(true);
  }, []);

  /** Update the currently-editing theme */
  const handleUpdateTheme = useCallback(async () => {
    if (!editingTheme) return;
    try {
      const themeConfig: ThemeConfig = {
        ...customTheme,
        colors: effectiveColors,
      };
      await publishTheme({
        themeConfig,
        title: editingTheme.title,
        description: editingTheme.description,
        identifier: editingTheme.identifier,
      });
      // Update local editing state to reflect current colors
      setEditingTheme({
        ...editingTheme,
        colors: effectiveColors,
        font: customTheme?.font,
        background: customTheme?.background,
      });
      toast({ title: `"${editingTheme.title}" updated`, description: 'Your theme has been saved and republished.' });
    } catch (error) {
      console.error('Failed to update theme:', error);
      toast({ title: 'Update failed', description: 'Could not update your theme.', variant: 'destructive' });
    }
  }, [editingTheme, customTheme, effectiveColors, publishTheme, toast]);

  /** Submit the publish dialog */
  const handlePublishSubmit = useCallback(async () => {
    if (!publishTitle.trim()) {
      toast({ title: 'Title required', description: 'Give your theme a name.', variant: 'destructive' });
      return;
    }
    try {
      const themeConfig: ThemeConfig = {
        ...customTheme,
        colors: effectiveColors,
      };
      const identifier = await publishTheme({
        themeConfig,
        title: publishTitle.trim(),
        description: publishDescription.trim() || undefined,
      });
      setPublishDialogOpen(false);
      setEditingTheme({
        identifier,
        title: publishTitle.trim(),
        description: publishDescription.trim() || undefined,
        colors: effectiveColors,
        font: customTheme?.font,
        background: customTheme?.background,
        event: {} as ThemeDefinition['event'],
      });
      toast({ title: 'Theme published!', description: `"${publishTitle.trim()}" is now available on Nostr.` });
    } catch (error) {
      console.error('Failed to publish theme:', error);
      toast({ title: 'Publish failed', description: 'Could not publish your theme.', variant: 'destructive' });
    }
  }, [publishTitle, publishDescription, customTheme, effectiveColors, publishTheme, toast]);

   return (
    <div className="space-y-5">
      {/* ── Themes grid ── */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Themes
        </h3>
        <div className="grid grid-cols-2 sidebar:grid-cols-3 gap-3">
          {builtinOptions.map((option) => {
            if (option.id === 'system') {
              const isActive = theme === 'system';
              const lightTokens = coreToTokens(resolveThemeConfig('light', themes).colors);
              const darkTokens = coreToTokens(resolveThemeConfig('dark', themes).colors);

              return (
                <button
                  key="system"
                  className={cn(
                    'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isActive
                      ? 'border-primary shadow-sm'
                      : 'border-border hover:border-primary/40',
                  )}
                  onClick={() => handleSelectBuiltin('system')}
                >
                  {/* Split preview: left light, right dark */}
                  <div className="aspect-[4/3] rounded-lg overflow-hidden relative">
                    {/* Light half */}
                    <SystemHalf tokens={lightTokens} side="left" />
                    {/* Dark half */}
                    <SystemHalf tokens={darkTokens} side="right" />

                    {/* Active check mark */}
                    {isActive && (
                      <div className="absolute top-1 left-1 size-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: hsl(lightTokens.primary) }}
                      >
                        <Check className="size-2.5" style={{ color: hsl(lightTokens.primaryForeground) }} />
                      </div>
                    )}
                  </div>

                  {/* Label */}
                  <p className={cn(
                    'mt-1.5 text-xs font-medium text-center transition-colors',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}>
                    {option.label}
                  </p>
                </button>
              );
            }

            // Light / Dark builtin
            const colors = resolveThemeConfig(option.id as 'light' | 'dark', themes).colors;
            const isActive = theme === option.id;

            return (
              <button
                key={option.id}
                className={cn(
                  'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() => handleSelectBuiltin(option.id)}
              >
                <ThemePreviewCard colors={colors} isActive={isActive} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {option.label}
                </p>
              </button>
            );
          })}

          {/* Preset buttons */}
          {presetOptions.map((preset) => {
            const isActive = isPresetActive(preset.colors);

            return (
              <button
                key={preset.id}
                className={cn(
                  'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() => handleSelectPreset(preset)}
              >
                <ThemePreviewCard colors={preset.colors} isActive={isActive} backgroundUrl={preset.background?.url} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {preset.label}
                </p>
              </button>
            );
          })}

          {/* User's published themes */}
          {userThemes.data?.map((def) => {
            const isActive = isUserThemeActive(def);

            return (
              <button
                key={`user:${def.identifier}`}
                className={cn(
                  'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isActive
                    ? 'border-primary shadow-sm'
                    : 'border-border hover:border-primary/40',
                )}
                onClick={() => handleSelectUserTheme(def)}
              >
                <ThemePreviewCard colors={def.colors} isActive={isActive} backgroundUrl={def.background?.url} />
                <p className={cn(
                  'mt-1.5 text-xs font-medium text-center transition-colors truncate',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )}>
                  {def.title}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Customize card ── */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
            Custom
          </h3>
          {editingTheme && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setEditingTheme(null)}
            >
              Editing "{editingTheme.title}"
            </button>
          )}
        </div>

        {/* Colors */}
        <div className="flex items-start justify-center gap-6 sidebar:justify-start sidebar:gap-8">
          {CORE_KEYS.map((key) => (
            <ColorPicker
              key={key}
              label={COLOR_LABELS[key]}
              value={hslStringToHex(effectiveColors[key])}
              onChange={(hex) => handleColorChange(key, hex)}
            />
          ))}
        </div>

        {/* Font */}
        <FontPicker />

        {/* Background */}
        <BackgroundPicker />

        {/* Publish / Update buttons */}
        {user && (
          <div className="flex gap-2 pt-1">
            {editingTheme && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleUpdateTheme}
                disabled={isPublishing}
              >
                <Palette className="size-3.5 mr-1.5" />
                {isPublishing ? 'Updating...' : 'Update Theme'}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handlePublishNew}
            >
              <Palette className="size-3.5 mr-1.5" />
              Publish Theme
            </Button>
          </div>
        )}
      </div>

      {/* ── Auto-share toggle ── */}
      {user && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="auto-share-theme" className="flex flex-col gap-1 cursor-pointer">
              <span className="text-sm font-medium">Share theme on your profile</span>
              <span className="text-xs text-muted-foreground font-normal">
                Automatically publish theme changes to your profile
              </span>
            </Label>
            <Switch
              id="auto-share-theme"
              checked={autoShareTheme}
              onCheckedChange={setAutoShareTheme}
            />
          </div>
        </div>
      )}

      {/* ── Publish Dialog ── */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Publish Theme</DialogTitle>
            <DialogDescription>
              Share your theme on Nostr. Others can browse, preview, and use it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Color swatch preview */}
            <div className="flex rounded-lg overflow-hidden h-8">
              {CORE_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex-1"
                  style={{ backgroundColor: hslStringToHex(effectiveColors[key]) }}
                />
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="theme-title">Title</Label>
              <Input
                id="theme-title"
                value={publishTitle}
                onChange={(e) => setPublishTitle(e.target.value)}
                placeholder="e.g. My Dark Theme"
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="theme-description">Description (optional)</Label>
              <Textarea
                id="theme-description"
                value={publishDescription}
                onChange={(e) => setPublishDescription(e.target.value)}
                placeholder="A sleek dark theme with purple accents..."
                maxLength={200}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handlePublishSubmit} disabled={isPublishing || !publishTitle.trim()}>
              <Palette className="size-4 mr-1.5" />
              {isPublishing ? 'Publishing...' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Half of the system theme preview (light or dark side) */
function SystemHalf({ tokens, side }: { tokens: ThemeTokens; side: 'left' | 'right' }) {
  return (
    <div
      className={cn('absolute inset-0', side === 'right' && 'left-1/2')}
      style={{ backgroundColor: hsl(tokens.background), ...(side === 'left' ? { width: '50%' } : {}) }}
    >
      <div className="h-2.5 w-full" style={{ backgroundColor: hsl(tokens.card) }} />
      <div className="p-1.5 space-y-1">
        <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: hsl(tokens.foreground), opacity: 0.6 }} />
        <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: hsl(tokens.mutedForeground), opacity: 0.4 }} />
        <div className="pt-0.5">
          <div className="h-2 w-8 rounded-sm" style={{ backgroundColor: hsl(tokens.primary) }} />
        </div>
      </div>
    </div>
  );
}
