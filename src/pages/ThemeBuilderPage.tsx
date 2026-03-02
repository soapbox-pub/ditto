import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, RotateCcw, Download, Upload, Save, Eye, AlertTriangle, Check, Heart, MessageCircle, Repeat2, Zap, Globe, Users, Flame, MoreHorizontal, Pencil, Trash2, Palette } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { ColorPicker } from '@/components/ui/color-picker';
import { useTheme } from '@/hooks/useTheme';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useActiveProfileTheme } from '@/hooks/useActiveProfileTheme';
import { usePublishTheme } from '@/hooks/usePublishTheme';
import { useUserThemes } from '@/hooks/useUserThemes';
import type { ThemeDefinition } from '@/lib/themeEvent';
import { FontPicker } from '@/components/FontPicker';
import { themePresets, coreToTokens, resolveThemeConfig, type CoreThemeColors } from '@/themes';
import { hslStringToHex, hexToHslString, getContrastRatioHsl } from '@/lib/colorUtils';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';

type PresetName = 'dark' | 'light' | 'black' | 'pink';

/** Core color keys exposed in the editor, in display order */
const CORE_KEYS: (keyof CoreThemeColors)[] = ['primary', 'text', 'background'];

/** Human-readable labels for core color keys */
const COLOR_LABELS: Record<keyof CoreThemeColors, string> = {
  primary: 'Primary',
  text: 'Text',
  background: 'Background',
};

export function ThemeBuilderPage() {
  const { config } = useAppContext();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { theme: currentTheme, customTheme: savedCustomTheme, themes: configuredThemes, applyCustomTheme } = useTheme();
  const { user } = useCurrentUser();
  const { publishTheme, setActiveTheme, deleteTheme, isPending: isPublishing } = usePublishTheme();

  // Check if we're importing from a profile or editing an existing theme
  const importPubkey = searchParams.get('import');
  const importThemeId = searchParams.get('theme');
  const editIdentifier = searchParams.get('edit');
  const isNew = searchParams.has('new');

  // Check if the user currently has a published active profile theme
  const ownActiveTheme = useActiveProfileTheme(user?.pubkey);
  const hasPublishedTheme = !!ownActiveTheme.data;

  // User's published theme definitions
  const _userThemes = useUserThemes(user?.pubkey);

  useSeoMeta({
    title: `Theme Builder | ${config.appName}`,
    description: 'Create and customize your profile theme',
  });

  // Working state: the 3 core colors being edited
  const [colors, setColors] = useState<CoreThemeColors>(() => {
    // ?new param: always start fresh
    if (isNew) return resolveThemeConfig('dark', configuredThemes).colors;
    if (savedCustomTheme) return savedCustomTheme.colors;
    if (currentTheme === 'light' || currentTheme === 'dark') {
      return resolveThemeConfig(currentTheme, configuredThemes).colors;
    }
    return resolveThemeConfig('dark', configuredThemes).colors;
  });
  const [previewing, setPreviewing] = useState(false);

  // Derive full tokens for preview rendering
  const tokens = useMemo(() => coreToTokens(colors), [colors]);

  // Tracks which published theme is currently being edited (null = creating new)
  const [activeEditingTheme, setActiveEditingTheme] = useState<ThemeDefinition | null>(() => {
    return null; // will be set by effects or user actions
  });

  // When user themes load, check if current colors match a published theme
  useEffect(() => {
    if (!_userThemes.data || activeEditingTheme || isNew || editIdentifier) return;
    const match = _userThemes.data.find(t => JSON.stringify(t.colors) === JSON.stringify(colors));
    if (match) setActiveEditingTheme(match);
  }, [_userThemes.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load a specific theme for editing via ?edit= param
  useEffect(() => {
    if (!editIdentifier || !_userThemes.data) return;
    const target = _userThemes.data.find(t => t.identifier === editIdentifier);
    if (target && activeEditingTheme?.identifier !== editIdentifier) {
      setColors(target.colors);
      applyCustomTheme({ colors: target.colors, font: target.font, background: target.background });
      setActiveEditingTheme(target);
    }
  }, [editIdentifier, _userThemes.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear editing context when starting fresh
  const handleNewTheme = useCallback(() => {
    setActiveEditingTheme(null);
    setColors(resolveThemeConfig('dark', configuredThemes).colors);
    window.history.replaceState({}, '', '/settings/theme/edit?new');
    toast({ title: 'Starting fresh', description: 'Create a new theme from scratch.' });
  }, [configuredThemes, toast]);

  // Import from another user's active profile theme or a specific theme definition
  const importActiveQuery = useActiveProfileTheme(importPubkey && !importThemeId ? importPubkey : undefined);
  const importThemesQuery = useUserThemes(importPubkey && importThemeId ? importPubkey : undefined);

  useEffect(() => {
    // Import a specific theme by identifier
    if (importThemeId && importThemesQuery.data) {
      const target = importThemesQuery.data.find(t => t.identifier === importThemeId);
      if (target) {
        setColors(target.colors);
        applyCustomTheme({ colors: target.colors, font: target.font, background: target.background });
        setActiveEditingTheme(null);
        toast({ title: 'Theme imported', description: `Imported "${target.title}". Customize it and save!` });
      }
    }
    // Import from active profile theme
    else if (importActiveQuery.data?.colors) {
      setColors(importActiveQuery.data.colors);
      applyCustomTheme({ colors: importActiveQuery.data.colors, font: importActiveQuery.data.font, background: importActiveQuery.data.background });
      setActiveEditingTheme(null);
      toast({ title: 'Theme imported', description: 'Imported theme from profile. Customize it and save!' });
    }
  }, [importActiveQuery.data, importThemesQuery.data, importThemeId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hex representations of current colors for color pickers
  const hexColors = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, hsl] of Object.entries(colors)) {
      try {
        result[key] = hslStringToHex(hsl);
      } catch {
        result[key] = '#000000';
      }
    }
    return result;
  }, [colors]);

  // Hex representations of derived tokens for preview
  const hexTokens = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, hsl] of Object.entries(tokens)) {
      try {
        result[key] = hslStringToHex(hsl);
      } catch {
        result[key] = '#000000';
      }
    }
    return result;
  }, [tokens]);

  // Update a single core color
  const updateColor = useCallback((key: keyof CoreThemeColors, hex: string) => {
    const hsl = hexToHslString(hex);
    setColors((prev) => ({ ...prev, [key]: hsl }));
  }, []);

  // Apply preset
  const applyPreset = useCallback((preset: PresetName) => {
    if (preset === 'light' || preset === 'dark') {
      setColors(resolveThemeConfig(preset, configuredThemes).colors);
    } else {
      setColors(themePresets[preset]?.colors ?? resolveThemeConfig('dark', configuredThemes).colors);
    }
    setActiveEditingTheme(null);
  }, [configuredThemes]);

  // Contrast warnings (derived from tokens)
  const contrastWarnings = useMemo(() => {
    const pairs: [string, string, string][] = [
      [tokens.foreground, tokens.background, 'Text on Background'],
      [tokens.primaryForeground, tokens.primary, 'Text on Primary'],
      [tokens.cardForeground, tokens.card, 'Text on Card'],
      [tokens.mutedForeground, tokens.muted, 'Muted Text on Muted'],
      [tokens.accentForeground, tokens.accent, 'Text on Accent'],
      [tokens.destructiveForeground, tokens.destructive, 'Text on Destructive'],
    ];
    return pairs.map(([fg, bg, label]) => {
      const ratio = getContrastRatioHsl(fg, bg);
      return { label, ratio, passes: ratio >= 4.5 };
    });
  }, [tokens]);

  const failingContrasts = contrastWarnings.filter((w) => !w.passes);

  // Preview: temporarily apply colors to the document
  const togglePreview = useCallback(() => {
    if (previewing) {
      setPreviewing(false);
      if (currentTheme === 'custom' && savedCustomTheme) {
        applyCustomTheme(savedCustomTheme);
      }
    } else {
      setPreviewing(true);
      applyCustomTheme({ colors, font: savedCustomTheme?.font, background: savedCustomTheme?.background });
    }
  }, [previewing, currentTheme, savedCustomTheme, colors, applyCustomTheme]);

  // Publish dialog state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | null>(null);

  // Save: apply locally + update/publish depending on context
  const handleSave = useCallback(async () => {
    applyCustomTheme({ colors, font: savedCustomTheme?.font, background: savedCustomTheme?.background });
    setPreviewing(false);

    if (user && activeEditingTheme) {
      try {
        const themeConfig = { colors, font: savedCustomTheme?.font, background: savedCustomTheme?.background };
        await publishTheme({
          themeConfig,
          title: activeEditingTheme.title,
          description: activeEditingTheme.description,
          identifier: activeEditingTheme.identifier,
        });
        if (ownActiveTheme.data?.sourceRef?.endsWith(`:${activeEditingTheme.identifier}`)) {
          await setActiveTheme({
            themeConfig,
            sourceAuthor: user.pubkey,
            sourceIdentifier: activeEditingTheme.identifier,
          });
        }
        toast({ title: `"${activeEditingTheme.title}" updated`, description: 'Your theme has been saved and republished.' });
      } catch (error) {
        console.error('Failed to update theme:', error);
        toast({ title: 'Theme saved locally', description: 'Saved but failed to update on Nostr.', variant: 'destructive' });
      }
    } else if (user) {
      setPublishTitle('');
      setPublishDescription('');
      setEditingTheme(null);
      setPublishDialogOpen(true);
    } else {
      toast({ title: 'Theme saved', description: 'Your custom theme is now active.' });
    }
  }, [colors, savedCustomTheme, user, activeEditingTheme, ownActiveTheme.data, applyCustomTheme, publishTheme, setActiveTheme, toast]);

  // Publish theme as kind 36767
  const handlePublish = useCallback(async () => {
    if (!publishTitle.trim()) {
      toast({ title: 'Title required', description: 'Give your theme a name.', variant: 'destructive' });
      return;
    }
    try {
      const isUpdate = !!editingTheme;
      const themeConfig = { colors, font: savedCustomTheme?.font, background: savedCustomTheme?.background };
      const identifier = await publishTheme({
        themeConfig,
        title: publishTitle.trim(),
        description: publishDescription.trim() || undefined,
        identifier: editingTheme?.identifier,
      });
      setPublishDialogOpen(false);

      setActiveEditingTheme({
        identifier,
        title: publishTitle.trim(),
        description: publishDescription.trim() || undefined,
        colors,
        font: savedCustomTheme?.font,
        background: savedCustomTheme?.background,
        event: {} as ThemeDefinition['event'],
      });

      if (!isUpdate) {
        await setActiveTheme({
          themeConfig,
          sourceAuthor: user?.pubkey,
          sourceIdentifier: identifier,
        });
        toast({ title: 'Theme published!', description: `"${publishTitle.trim()}" is now live on your profile and in the public feed.` });
      } else {
        toast({ title: 'Theme updated', description: `"${publishTitle.trim()}" has been updated.` });
      }
    } catch (error) {
      console.error('Failed to publish theme:', error);
      toast({ title: 'Publish failed', description: 'Could not publish your theme.', variant: 'destructive' });
    }
  }, [publishTitle, publishDescription, colors, savedCustomTheme, editingTheme, user, publishTheme, setActiveTheme, toast]);

  // Skip publish — just save locally
  const handleSkipPublish = useCallback(() => {
    setPublishDialogOpen(false);
    toast({ title: 'Theme saved', description: 'Your custom theme is now active locally.' });
  }, [toast]);

  // Export/import JSON
  const handleExport = useCallback(() => {
    const json = JSON.stringify(colors, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ditto-theme.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [colors]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string);
        // Accept current 3-color, old 4-color, and legacy 19-token formats
        if (imported.background && imported.text && imported.primary) {
          setColors({ background: imported.background, text: imported.text, primary: imported.primary });
          toast({ title: 'Theme imported', description: 'JSON theme loaded successfully.' });
        } else if (imported.background && imported.foreground && imported.primary) {
          // Legacy 19-token format
          setColors({ background: imported.background, text: imported.foreground, primary: imported.primary });
          toast({ title: 'Theme imported', description: 'Legacy theme format converted successfully.' });
        } else {
          toast({ title: 'Invalid theme', description: 'The file does not contain valid theme colors.', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Import failed', description: 'Could not parse the JSON file.', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [toast]);

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border">
      {/* Header */}
      <div className={cn(STICKY_HEADER_CLASS, 'bg-background/80 backdrop-blur-md z-10 border-b border-border')}>
        <div className="flex items-center gap-4 px-4 pt-3 pb-2">
          <Link to="/settings/theme" className="p-2 rounded-full hover:bg-secondary transition-colors">
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex-1 min-w-0">
            {activeEditingTheme ? (
              <button
                onClick={() => {
                  setEditingTheme(activeEditingTheme);
                  setPublishTitle(activeEditingTheme.title);
                  setPublishDescription(activeEditingTheme.description || '');
                  setPublishDialogOpen(true);
                }}
                className="text-left group"
              >
                <h1 className="text-lg font-bold truncate group-hover:text-primary transition-colors flex items-center gap-1.5">
                  {activeEditingTheme.title}
                  <Pencil className="size-3 text-muted-foreground group-hover:text-primary shrink-0" />
                </h1>
                {activeEditingTheme.description ? (
                  <p className="text-xs text-muted-foreground truncate">{activeEditingTheme.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Tap to edit title & description</p>
                )}
              </button>
            ) : (
              <div>
                <h1 className="text-lg font-bold truncate">New Theme</h1>
                <p className="text-xs text-muted-foreground">Create a new custom theme</p>
              </div>
            )}
          </div>
          {activeEditingTheme && (
            currentTheme === 'custom' && savedCustomTheme && JSON.stringify(savedCustomTheme.colors) === JSON.stringify(colors) ? (
              <Badge variant="outline" className="text-primary border-primary/30 gap-1 shrink-0">
                <Check className="size-3" />
                Active
              </Badge>
            ) : (
              <Button variant="outline" size="sm" onClick={() => { applyCustomTheme({ colors, font: savedCustomTheme?.font, background: savedCustomTheme?.background }); toast({ title: 'Theme applied' }); }}>
                <Palette className="size-4 mr-1.5" />
                Use
              </Button>
            )
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 pb-2.5">
          <button
            onClick={togglePreview}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <Eye className="size-3.5" />
            {previewing ? 'Revert' : 'Preview'}
          </button>
          <span className="text-border">|</span>
          <button
            onClick={handleSave}
            disabled={isPublishing}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 disabled:opacity-50"
          >
            <Save className="size-3.5" />
            {isPublishing ? 'Saving...' : activeEditingTheme ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      {/* Core color bar — visual strip below header */}
      <div className="flex h-10">
        {CORE_KEYS.map((key) => (
          <div
            key={key}
            className="flex-1 transition-colors duration-300"
            style={{ backgroundColor: hexColors[key] || '#888' }}
          />
        ))}
      </div>

      <div className="p-4 space-y-6">
        {/* Start from existing theme */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Start from existing theme</h2>
          <StartFromThemeDropdown
            userThemes={_userThemes.data ?? []}
            onSelect={(selectedColors) => {
              setColors(selectedColors);
              setActiveEditingTheme(null);
            }}
          />
        </section>

        <Separator />

        {/* Core colors */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Colors</h2>
          <div className="grid grid-cols-2 gap-3">
            {CORE_KEYS.map((key) => (
              <ColorPicker
                key={key}
                label={COLOR_LABELS[key]}
                value={hexColors[key] || '#000000'}
                onChange={(hex) => updateColor(key, hex)}
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            All surface, border, and UI colors are automatically derived from these 3 core colors.
          </p>
        </section>

        {/* Font */}
        <FontPicker />

        <Separator />

        {/* Live preview */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Preview</h2>
          <ThemePreview hexTokens={hexTokens} />
        </section>

        <Separator />

        {/* Contrast warnings */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Accessibility</h2>
          <div className="space-y-2">
            {contrastWarnings.map((w) => (
              <div key={w.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{w.label}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">{w.ratio.toFixed(1)}:1</span>
                  {w.passes ? (
                    <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                      <Check className="size-3 mr-1" /> AA
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs bg-orange-500/10 text-orange-600 border-orange-500/20">
                      <AlertTriangle className="size-3 mr-1" /> Low
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
          {failingContrasts.length > 0 && (
            <p className="text-xs text-orange-600">
              {failingContrasts.length} color pair{failingContrasts.length > 1 ? 's' : ''} below WCAG AA (4.5:1). Consider adjusting for better readability.
            </p>
          )}
        </section>

        <Separator />

        {/* Profile theme status */}
        {user && (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Profile Theme</h2>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-primary" />
                    <span className="text-sm font-medium">
                      {hasPublishedTheme ? 'Profile theme active' : 'No profile theme'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hasPublishedTheme
                      ? 'Visitors see your theme on your profile. Saving auto-updates it.'
                      : 'Publish a theme to display it on your profile.'}
                  </p>
                </div>
                {hasPublishedTheme && (
                  <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 border-green-500/20 shrink-0">
                    <Check className="size-3 mr-1" /> Live
                  </Badge>
                )}
              </div>
            </section>

            <Separator />
          </>
        )}

        {/* Import / Export */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Import & Export</h2>

          {/* Import from profile */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Import from a Nostr profile</Label>
            <ImportFromProfile />
          </div>

          {/* File import/export */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="size-4 mr-1.5" />
              Export JSON
            </Button>
            <label>
              <Button variant="outline" size="sm" asChild>
                <span>
                  <Upload className="size-4 mr-1.5" />
                  Import JSON
                </span>
              </Button>
              <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
            </label>
            <Button variant="outline" size="sm" onClick={() => applyPreset('dark')}>
              <RotateCcw className="size-4 mr-1.5" />
              Reset
            </Button>
          </div>
        </section>

        {/* Delete theme */}
        {user && activeEditingTheme && (
          <>
            <Separator />
            <section>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full justify-center"
                disabled={isPublishing}
                onClick={async () => {
                  if (!activeEditingTheme) return;
                  try {
                    await deleteTheme(activeEditingTheme);
                    toast({ title: 'Theme deleted', description: `"${activeEditingTheme.title}" has been removed.` });
                    handleNewTheme();
                  } catch {
                    toast({ title: 'Failed', description: 'Could not delete theme.', variant: 'destructive' });
                  }
                }}
              >
                <Trash2 className="size-4 mr-1.5" />
                Delete "{activeEditingTheme.title}"
              </Button>
            </section>
          </>
        )}
      </div>

      {/* ── Publish Dialog ── */}
      <Dialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingTheme ? 'Edit Theme Details' : 'Publish Theme on Nostr?'}
            </DialogTitle>
            <DialogDescription>
              {editingTheme
                ? 'Update your theme\'s title and description.'
                : 'Share your theme with the Nostr community. Others can browse, preview, and use it.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Color swatch preview */}
            <div className="flex rounded-lg overflow-hidden h-8">
              {CORE_KEYS.map((key) => (
                <div
                  key={key}
                  className="flex-1"
                  style={{ backgroundColor: hexColors[key] }}
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
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {!editingTheme && (
              <Button variant="ghost" onClick={handleSkipPublish} className="sm:mr-auto">
                Skip
              </Button>
            )}
            <Button onClick={handlePublish} disabled={isPublishing || !publishTitle.trim()}>
              <Palette className="size-4 mr-1.5" />
              {isPublishing ? 'Publishing...' : editingTheme ? 'Update' : 'Publish'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

// ─── Start From Existing Theme Dropdown ───────────────────────────────

function StartFromThemeDropdown({ userThemes, onSelect }: {
  userThemes: ThemeDefinition[];
  onSelect: (colors: CoreThemeColors) => void;
}) {
  const { themes: configuredThemes } = useTheme();
  const allOptions = [
    // User's published themes
    ...userThemes.map(t => ({
      group: 'my' as const,
      id: `user:${t.identifier}`,
      label: t.title,
      colors: t.colors,
    })),
    // Builtin themes
    { group: 'builtin' as const, id: 'builtin:light', label: 'Light', colors: resolveThemeConfig('light', configuredThemes).colors },
    { group: 'builtin' as const, id: 'builtin:dark', label: 'Dark', colors: resolveThemeConfig('dark', configuredThemes).colors },
    // Presets
    ...Object.entries(themePresets).map(([id, preset]) => ({
      group: 'preset' as const,
      id: `preset:${id}`,
      label: preset.label,
      colors: preset.colors,
    })),
  ];

  const hasUserThemes = userThemes.length > 0;

  return (
    <Select onValueChange={(val) => {
      const option = allOptions.find(o => o.id === val);
      if (option) onSelect(option.colors);
    }}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="Choose a theme to start from..." />
      </SelectTrigger>
      <SelectContent>
        {hasUserThemes && (
          <SelectGroup>
            <SelectLabel>My Themes</SelectLabel>
            {allOptions.filter(o => o.group === 'my').map(o => (
              <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
            ))}
          </SelectGroup>
        )}
        <SelectGroup>
          <SelectLabel>Builtin</SelectLabel>
          {allOptions.filter(o => o.group === 'builtin').map(o => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Presets</SelectLabel>
          {allOptions.filter(o => o.group === 'preset').map(o => (
            <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}


// ─── Import from Profile ──────────────────────────────────────────────

function ImportFromProfile() {
  const [importInput, setImportInput] = useState('');
  const { toast } = useToast();

  const handleImport = useCallback(() => {
    if (!importInput.trim()) return;
    try {
      let pubkey = importInput.trim();
      if (pubkey.startsWith('npub1') || pubkey.startsWith('nprofile1')) {
        const decoded = nip19.decode(pubkey);
        pubkey = decoded.type === 'npub' ? decoded.data : decoded.type === 'nprofile' ? decoded.data.pubkey : pubkey;
      }
      if (/^[0-9a-f]{64}$/i.test(pubkey)) {
        window.location.href = `/settings/theme/edit?import=${pubkey}`;
      } else {
        toast({ title: 'Invalid identifier', description: 'Enter an npub or hex pubkey.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Invalid identifier', description: 'Could not decode the Nostr identifier.', variant: 'destructive' });
    }
  }, [importInput, toast]);

  return (
    <div className="flex gap-2">
      <Input
        value={importInput}
        onChange={(e) => setImportInput(e.target.value)}
        placeholder="npub1... or hex pubkey"
        className="h-9 text-sm"
      />
      <Button variant="outline" size="sm" onClick={handleImport} className="shrink-0">
        <Upload className="size-4 mr-1.5" />
        Import
      </Button>
    </div>
  );
}

// ─── Live Preview Component ───────────────────────────────────────────

function ThemePreview({ hexTokens }: { hexTokens: Record<string, string> }) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey);
  const metadata = author.data?.metadata;

  const displayName = metadata?.name || metadata?.display_name || 'Alice';
  const handle = metadata?.nip05?.split('@')[0] || metadata?.name?.toLowerCase() || 'alice';
  const bio = metadata?.about || 'Nostr enthusiast. Building cool things on the decentralized web.';
  const avatar = metadata?.picture;
  const banner = metadata?.banner;
  const initial = displayName[0]?.toUpperCase() || 'A';

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: hexTokens.border, backgroundColor: hexTokens.background }}>

      {/* ── Profile Header ── */}
      <div className="h-32 relative" style={{ backgroundColor: hexTokens.secondary }}>
        {banner ? (
          <img src={banner} alt="" className="w-full h-full object-cover" />
        ) : (
          <div
            className="absolute inset-0"
            style={{ background: `linear-gradient(135deg, ${hexTokens.accent}1a, transparent, ${hexTokens.primary}0d)` }}
          />
        )}
      </div>

      {/* Profile info */}
      <div className="px-4 pb-3 relative z-10" style={{ backgroundColor: hexTokens.background }}>
        <div className="flex justify-between items-start -mt-10 mb-2">
          {avatar ? (
            <img
              src={avatar}
              alt={displayName}
              className="size-20 rounded-full object-cover shrink-0"
              style={{ border: `4px solid ${hexTokens.background}` }}
            />
          ) : (
            <div
              className="size-20 rounded-full flex items-center justify-center text-xl font-bold shrink-0"
              style={{
                backgroundColor: `${hexTokens.primary}33`,
                color: hexTokens.primary,
                border: `4px solid ${hexTokens.background}`,
              }}
            >
              {initial}
            </div>
          )}
          <div className="flex items-center gap-2 mt-12">
            <div
              className="size-9 rounded-full flex items-center justify-center"
              style={{ border: `1px solid ${hexTokens.border}` }}
            >
              <MoreHorizontal className="size-4" style={{ color: hexTokens.foreground }} />
            </div>
            <button
              className="px-4 py-1.5 rounded-full text-xs font-bold"
              style={{ backgroundColor: hexTokens.primary, color: hexTokens.primaryForeground }}
            >
              Edit profile
            </button>
          </div>
        </div>

        <p className="text-lg font-bold truncate" style={{ color: hexTokens.foreground }}>{displayName}</p>
        <p className="text-xs" style={{ color: hexTokens.mutedForeground }}>@{handle}</p>

        <div className="flex items-center gap-4 mt-1.5">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" style={{ color: hexTokens.primary }} />
            <span className="text-xs font-bold" style={{ color: hexTokens.primary }}>142</span>
            <span className="text-xs" style={{ color: hexTokens.mutedForeground }}>following</span>
          </span>
          <span className="flex items-center gap-1">
            <Flame className="size-3.5" style={{ color: hexTokens.accent }} />
            <span className="text-xs font-bold" style={{ color: hexTokens.foreground }}>7</span>
          </span>
        </div>

        <p className="mt-2 text-sm line-clamp-3" style={{ color: hexTokens.foreground }}>
          {bio}
        </p>
      </div>

      {/* ── Tabs ── */}
      <div className="flex" style={{ borderBottom: `1px solid ${hexTokens.border}`, backgroundColor: `${hexTokens.background}cc` }}>
        {['Posts', 'Replies', 'Media', 'Likes'].map((tab, i) => (
          <button
            key={tab}
            className="flex-1 py-2.5 text-xs font-medium text-center relative"
            style={{ color: i === 0 ? hexTokens.foreground : hexTokens.mutedForeground }}
          >
            {tab}
            {i === 0 && (
              <div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 rounded-full"
                style={{ backgroundColor: hexTokens.primary }}
              />
            )}
          </button>
        ))}
      </div>

      {/* ── Note Card ── */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: `1px solid ${hexTokens.border}`, backgroundColor: hexTokens.background }}
      >
        <div className="flex items-center gap-2.5">
          {avatar ? (
            <img src={avatar} alt={displayName} className="size-10 rounded-full object-cover shrink-0" />
          ) : (
            <div
              className="size-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
              style={{ backgroundColor: `${hexTokens.primary}33`, color: hexTokens.primary }}
            >
              {initial}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm truncate" style={{ color: hexTokens.foreground }}>{displayName}</span>
            </div>
            <div className="flex items-center gap-1 text-xs" style={{ color: hexTokens.mutedForeground }}>
              <span>@{handle}</span>
              <span>·</span>
              <span>2h</span>
            </div>
          </div>
        </div>

        <p className="mt-2 text-sm leading-relaxed" style={{ color: hexTokens.foreground }}>
          Just updated my custom theme! Love how you can personalize everything on Nostr.
        </p>

        <div className="flex items-center gap-5 mt-2.5 -ml-2">
          <span className="flex items-center gap-1.5 p-1.5 rounded-full" style={{ color: hexTokens.mutedForeground }}>
            <MessageCircle className="size-4" /> <span className="text-xs">3</span>
          </span>
          <span className="flex items-center gap-1.5 p-1.5 rounded-full" style={{ color: hexTokens.accent }}>
            <Repeat2 className="size-4" /> <span className="text-xs">1</span>
          </span>
          <span className="flex items-center gap-1.5 p-1.5 rounded-full" style={{ color: hexTokens.mutedForeground }}>
            <Heart className="size-4" /> <span className="text-xs">12</span>
          </span>
          <span className="flex items-center gap-1.5 p-1.5 rounded-full" style={{ color: '#f59e0b' }}>
            <Zap className="size-4" /> <span className="text-xs">2.1k</span>
          </span>
        </div>
      </div>

      {/* ── Second Note ── */}
      <div className="px-4 py-3" style={{ backgroundColor: hexTokens.background }}>
        <div className="flex items-center gap-2.5">
          <div
            className="size-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
            style={{ backgroundColor: hexTokens.muted, color: hexTokens.mutedForeground }}
          >
            N
          </div>
          <div className="min-w-0 flex-1">
            <span className="font-bold text-sm" style={{ color: hexTokens.foreground }}>Nostr</span>
            <div className="flex items-center gap-1 text-xs" style={{ color: hexTokens.mutedForeground }}>
              <span>@nostr</span>
              <span>·</span>
              <span>5h</span>
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: hexTokens.foreground }}>
          The decentralized social web is looking better every day.
        </p>
      </div>
    </div>
  );
}
