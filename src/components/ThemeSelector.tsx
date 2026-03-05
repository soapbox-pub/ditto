import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Check, Palette, Trash2, ChevronDown, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react';
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
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
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

/** A single theme button used inside ThemeGrid */
function ThemeButton({
  isActive,
  label,
  truncate = false,
  scroll = false,
  carousel = false,
  onClick,
  children,
}: {
  isActive: boolean;
  label: string;
  truncate?: boolean;
  scroll?: boolean;
  carousel?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={cn(
        'relative group rounded-xl border-2 p-1 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isActive ? 'border-primary shadow-sm' : 'border-border hover:border-primary/40',
        scroll && 'flex-1',
        carousel && 'w-full',
      )}
      onClick={onClick}
    >
      {children}
      <p className={cn(
        'mt-1.5 text-xs font-medium text-center transition-colors',
        isActive ? 'text-foreground' : 'text-muted-foreground',
        truncate && 'truncate',
      )}>
        {label}
      </p>
    </button>
  );
}

/**
 * Renders the grid of theme options (builtins + presets + user themes).
 * Applies selection immediately via `useTheme`. Calls `onSelect` after
 * each pick so callers (e.g. onboarding) can react without duplicating logic.
 */
export function ThemeGrid({
  onSelect,
  editingTheme,
  onEditingThemeChange,
  columns = 'responsive',
}: {
  /** Called after any theme is selected. */
  onSelect?: () => void;
  /** Currently-editing user theme (for active state). Pass null if not in editor mode. */
  editingTheme?: ThemeDefinition | null;
  /** Callback to update editing theme state in the parent. */
  onEditingThemeChange?: (def: ThemeDefinition | null) => void;
  /**
   * Layout mode:
   * - 'responsive': 2-col grid on mobile, 3-col at sidebar breakpoint (900px)
   * - 'sm': 2-col grid on mobile, 3-col at sm (640px)
   * - '2': always 2-col grid
   * - 'scroll': horizontal scrolling strip on mobile, 3-col grid at sm+
   */
  columns?: 'responsive' | 'sm' | '2' | 'scroll';
}) {
  const { theme, customTheme, themes, setTheme, applyCustomTheme } = useTheme();
  const { user } = useCurrentUser();
  const userThemes = useUserThemes(user?.pubkey);

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

  const isPresetActive = (presetColors: CoreThemeColors): boolean => {
    if (theme !== 'custom' || !customTheme) return false;
    return JSON.stringify(customTheme.colors) === JSON.stringify(presetColors);
  };

  const isUserThemeActive = (def: ThemeDefinition): boolean => {
    return editingTheme?.identifier === def.identifier && theme === 'custom';
  };

  const handleSelectBuiltin = useCallback((id: Theme) => {
    onEditingThemeChange?.(null);
    setTheme(id);
    onSelect?.();
  }, [setTheme, onSelect, onEditingThemeChange]);

  const handleSelectPreset = useCallback((preset: { colors: CoreThemeColors; font?: ThemeConfig['font']; background?: ThemeConfig['background'] }) => {
    onEditingThemeChange?.(null);
    applyCustomTheme({ colors: preset.colors, font: preset.font, background: preset.background });
    onSelect?.();
  }, [applyCustomTheme, onSelect, onEditingThemeChange]);

  const handleSelectUserTheme = useCallback((def: ThemeDefinition) => {
    onEditingThemeChange?.(def);
    applyCustomTheme({ colors: def.colors, font: def.font, background: def.background, title: def.title });
    onSelect?.();
  }, [applyCustomTheme, onSelect, onEditingThemeChange]);

  const isScroll = columns === 'scroll';

  // Carousel state for scroll mode (mobile only)
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState(0);

  // Build a flat list of item descriptors (needed for carousel auto-select)
  type ItemDescriptor = {
    key: string;
    label: string;
    truncate: boolean;
    onSelect: () => void;
    preview: React.ReactNode;
    isActive: boolean;
  };

  const buildItems = (): ItemDescriptor[] => {
    const items: ItemDescriptor[] = [];

    for (const option of builtinOptions) {
      if (option.id === 'system') {
        const isActive = theme === 'system';
        const lightTokens = coreToTokens(resolveThemeConfig('light', themes).colors);
        const darkTokens = coreToTokens(resolveThemeConfig('dark', themes).colors);
        items.push({
          key: 'system',
          label: option.label,
          truncate: false,
          onSelect: () => handleSelectBuiltin('system'),
          isActive,
          preview: (
            <div className="aspect-[4/3] rounded-lg overflow-hidden relative">
              <SystemHalf tokens={lightTokens} side="left" />
              <SystemHalf tokens={darkTokens} side="right" />
              {isActive && (
                <div className="absolute top-1 left-1 size-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: hsl(lightTokens.primary) }}
                >
                  <Check className="size-2.5" style={{ color: hsl(lightTokens.primaryForeground) }} />
                </div>
              )}
            </div>
          ),
        });
      } else {
        const colors = resolveThemeConfig(option.id as 'light' | 'dark', themes).colors;
        const isActive = theme === option.id;
        items.push({
          key: option.id,
          label: option.label,
          truncate: false,
          onSelect: () => handleSelectBuiltin(option.id),
          isActive,
          preview: <ThemePreviewCard colors={colors} isActive={isActive} />,
        });
      }
    }

    for (const preset of presetOptions) {
      const isActive = isPresetActive(preset.colors);
      items.push({
        key: preset.id,
        label: preset.label,
        truncate: false,
        onSelect: () => handleSelectPreset(preset),
        isActive,
        preview: <ThemePreviewCard colors={preset.colors} isActive={isActive} backgroundUrl={preset.background?.url} />,
      });
    }

    for (const def of (userThemes.data ?? [])) {
      const isActive = isUserThemeActive(def);
      items.push({
        key: `user:${def.identifier}`,
        label: def.title,
        truncate: true,
        onSelect: () => handleSelectUserTheme(def),
        isActive,
        preview: <ThemePreviewCard colors={def.colors} isActive={isActive} backgroundUrl={def.background?.url} />,
      });
    }

    return items;
  };

  const allItems = buildItems();

  if (isScroll) {
    // Auto-select the theme that scrolls into view
    const handleScroll = () => {
      const el = scrollRef.current;
      if (!el) return;
      const page = Math.round(el.scrollLeft / el.clientWidth);
      if (page !== activePage) {
        setActivePage(page);
        allItems[page]?.onSelect();
      }
    };

    const goToPage = (page: number) => {
      const el = scrollRef.current;
      if (!el) return;
      el.scrollTo({ left: page * el.clientWidth, behavior: 'smooth' });
    };

    const canPrev = activePage > 0;
    const canNext = activePage < allItems.length - 1;

    return (
      <>
        {/* Mobile carousel */}
        <div className="sm:hidden space-y-3">
          <div className="flex items-center gap-2">
            {/* Left arrow */}
            <button
              onClick={() => goToPage(activePage - 1)}
              disabled={!canPrev}
              className={cn(
                'shrink-0 size-8 flex items-center justify-center rounded-full',
                'bg-muted border border-border shadow-sm',
                'transition-opacity duration-200',
                canPrev ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <ChevronLeft className="size-4" />
            </button>

            {/* Scroll container — 1 card per page, swipeable */}
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex flex-1 overflow-x-auto snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {allItems.map((item) => (
                <div key={item.key} className="shrink-0 w-full snap-start">
                  <ThemeButton
                    isActive={item.isActive}
                    label={item.label}
                    truncate={item.truncate}
                    onClick={item.onSelect}
                    carousel
                  >
                    {item.preview}
                  </ThemeButton>
                </div>
              ))}
            </div>

            {/* Right arrow */}
            <button
              onClick={() => goToPage(activePage + 1)}
              disabled={!canNext}
              className={cn(
                'shrink-0 size-8 flex items-center justify-center rounded-full',
                'bg-muted border border-border shadow-sm',
                'transition-opacity duration-200',
                canNext ? 'opacity-100' : 'opacity-0 pointer-events-none',
              )}
            >
              <ChevronRightIcon className="size-4" />
            </button>
          </div>

          {/* Dot indicators */}
          <div className="flex justify-center gap-1.5">
            {allItems.map((_, i) => (
              <button
                key={i}
                onClick={() => goToPage(i)}
                className={cn(
                  'rounded-full transition-all duration-200',
                  i === activePage
                    ? 'w-4 h-1.5 bg-primary'
                    : 'w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60',
                )}
              />
            ))}
          </div>
        </div>

        {/* Desktop grid */}
        <div className="hidden sm:grid sm:grid-cols-3 gap-3">
          {allItems.map((item) => (
            <ThemeButton
              key={item.key}
              isActive={item.isActive}
              label={item.label}
              truncate={item.truncate}
              onClick={item.onSelect}
            >
              {item.preview}
            </ThemeButton>
          ))}
        </div>
      </>
    );
  }

  const gridClass =
    columns === '2' ? 'grid grid-cols-2 gap-3'
    : columns === 'sm' ? 'grid grid-cols-2 sm:grid-cols-3 gap-3'
    : 'grid grid-cols-2 sidebar:grid-cols-3 gap-3';

  return (
    <div className={gridClass}>
      {allItems.map((item) => (
        <ThemeButton
          key={item.key}
          isActive={item.isActive}
          label={item.label}
          truncate={item.truncate}
          onClick={item.onSelect}
        >
          {item.preview}
        </ThemeButton>
      ))}
    </div>
  );
}

interface ThemeSelectorProps {
  /** Controls the builder dialog from the parent (e.g., FAB or header button). */
  builderOpen?: boolean;
  /** Callback when the builder dialog open state changes. */
  onBuilderOpenChange?: (open: boolean) => void;
  /** Whether the builder should open in 'new' or 'edit' mode. */
  builderMode?: 'new' | 'edit';
}

export function ThemeSelector({ builderOpen, onBuilderOpenChange, builderMode }: ThemeSelectorProps = {}) {
  const { theme, customTheme, themes, autoShareTheme, setTheme, applyCustomTheme, setAutoShareTheme } = useTheme();
  const { user } = useCurrentUser();
  const { publishTheme, deleteTheme, isPending: isPublishing } = usePublishTheme();
  const { toast } = useToast();

  // Editor mode: which user theme is being edited
  const [editingTheme, setEditingTheme] = useState<ThemeDefinition | null>(null);

  // Publish dialog state
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState('');
  const [publishDescription, setPublishDescription] = useState('');

  // Clear editingTheme when builder opens in 'new' mode
  useEffect(() => {
    if (builderOpen && builderMode === 'new') {
      setEditingTheme(null);
    }
  }, [builderOpen, builderMode]);

  /** The effective colors for the current theme (used in the color editor) */
  const effectiveColors = getEffectiveColors(theme, customTheme, themes);

  /** Handle a color change from the inline editor */
  const handleColorChange = useCallback((key: keyof CoreThemeColors, hex: string) => {
    const hslValue = hexToHslString(hex);
    const newColors = { ...effectiveColors, [key]: hslValue };
    applyCustomTheme({ ...customTheme, colors: newColors });
  }, [effectiveColors, applyCustomTheme, customTheme]);

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
      const themeConfig: ThemeConfig = { ...customTheme, colors: effectiveColors };
      await publishTheme({
        themeConfig,
        title: editingTheme.title,
        description: editingTheme.description,
        identifier: editingTheme.identifier,
      });
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
      const themeConfig: ThemeConfig = { ...customTheme, colors: effectiveColors };
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

  /** Delete the currently-editing theme */
  const handleDeleteTheme = useCallback(async () => {
    if (!editingTheme) return;
    try {
      await deleteTheme(editingTheme);
      toast({ title: 'Theme deleted', description: `"${editingTheme.title}" has been removed.` });
      setEditingTheme(null);
      setTheme('system');
      onBuilderOpenChange?.(false);
    } catch (error) {
      console.error('Failed to delete theme:', error);
      toast({ title: 'Delete failed', description: 'Could not delete your theme.', variant: 'destructive' });
    }
  }, [editingTheme, deleteTheme, toast, setTheme, onBuilderOpenChange]);

  // ── Build sectioned item lists ──
  const userThemes = useUserThemes(user?.pubkey);

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

  const isPresetActive = (presetColors: CoreThemeColors): boolean => {
    if (theme !== 'custom' || !customTheme) return false;
    return JSON.stringify(customTheme.colors) === JSON.stringify(presetColors);
  };

  const isUserThemeActive = (def: ThemeDefinition): boolean => {
    return editingTheme?.identifier === def.identifier && theme === 'custom';
  };

  const handleSelectBuiltin = useCallback((id: Theme) => {
    setEditingTheme(null);
    setTheme(id);
  }, [setTheme]);

  const handleSelectPreset = useCallback((preset: { colors: CoreThemeColors; font?: ThemeConfig['font']; background?: ThemeConfig['background'] }) => {
    setEditingTheme(null);
    applyCustomTheme({ colors: preset.colors, font: preset.font, background: preset.background });
  }, [applyCustomTheme]);

  const handleSelectUserTheme = useCallback((def: ThemeDefinition) => {
    setEditingTheme(def);
    applyCustomTheme({ colors: def.colors, font: def.font, background: def.background, title: def.title });
  }, [applyCustomTheme]);

  type SectionItem = {
    key: string;
    label: string;
    truncate: boolean;
    onSelect: () => void;
    preview: React.ReactNode;
    isActive: boolean;
  };

  // Build items by category
  const buildBuiltinItems = (): SectionItem[] => {
    const items: SectionItem[] = [];
    for (const option of builtinOptions) {
      if (option.id === 'system') {
        const isActive = theme === 'system';
        const lightTokens = coreToTokens(resolveThemeConfig('light', themes).colors);
        const darkTokens = coreToTokens(resolveThemeConfig('dark', themes).colors);
        items.push({
          key: 'system',
          label: option.label,
          truncate: false,
          onSelect: () => handleSelectBuiltin('system'),
          isActive,
          preview: (
            <div className="aspect-[4/3] rounded-lg overflow-hidden relative">
              <SystemHalf tokens={lightTokens} side="left" />
              <SystemHalf tokens={darkTokens} side="right" />
              {isActive && (
                <div className="absolute top-1 left-1 size-4 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: hsl(lightTokens.primary) }}
                >
                  <Check className="size-2.5" style={{ color: hsl(lightTokens.primaryForeground) }} />
                </div>
              )}
            </div>
          ),
        });
      } else {
        const colors = resolveThemeConfig(option.id as 'light' | 'dark', themes).colors;
        const isActive = theme === option.id;
        items.push({
          key: option.id,
          label: option.label,
          truncate: false,
          onSelect: () => handleSelectBuiltin(option.id),
          isActive,
          preview: <ThemePreviewCard colors={colors} isActive={isActive} />,
        });
      }
    }
    return items;
  };

  const buildPresetItems = (): SectionItem[] =>
    presetOptions.map((preset) => {
      const isActive = isPresetActive(preset.colors);
      return {
        key: preset.id,
        label: preset.label,
        truncate: false,
        onSelect: () => handleSelectPreset(preset),
        isActive,
        preview: <ThemePreviewCard colors={preset.colors} isActive={isActive} backgroundUrl={preset.background?.url} />,
      };
    });

  const buildUserThemeItems = (): SectionItem[] =>
    (userThemes.data ?? []).map((def) => {
      const isActive = isUserThemeActive(def);
      return {
        key: `user:${def.identifier}`,
        label: def.title,
        truncate: true,
        onSelect: () => handleSelectUserTheme(def),
        isActive,
        preview: <ThemePreviewCard colors={def.colors} isActive={isActive} backgroundUrl={def.background?.url} />,
      };
    });

  const builtinItems = buildBuiltinItems();
  const presetItems = buildPresetItems();
  const userThemeItems = buildUserThemeItems();

  // Find the active item across all sections
  const allItems = [...builtinItems, ...presetItems, ...userThemeItems];
  const activeItem = allItems.find((item) => item.isActive);
  const activeKey = activeItem?.key;

  // Filter the active item out of My Themes and Presets so it only appears once
  const filteredUserThemeItems = userThemeItems.filter((item) => item.key !== activeKey);
  const filteredPresetItems = [...builtinItems, ...presetItems].filter((item) => item.key !== activeKey);

  const gridClass = 'grid grid-cols-2 sidebar:grid-cols-3 gap-3';

  return (
    <div className="space-y-6">
      {/* ── Active Theme + My Themes (shared grid) ── */}
      {(activeItem || filteredUserThemeItems.length > 0) && (
        <div className={gridClass}>
          {/* Active Theme */}
          {activeItem && (
            <>
              <h3 className="col-span-full text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Active Theme
              </h3>
              <ThemeButton
                isActive={activeItem.isActive}
                label={activeItem.label}
                truncate={activeItem.truncate}
                onClick={activeItem.onSelect}
              >
                {activeItem.preview}
              </ThemeButton>
            </>
          )}

          {/* My Themes */}
          {filteredUserThemeItems.length > 0 && (
            <>
              <h3 className="col-span-full text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mt-2">
                My Themes
              </h3>
              {filteredUserThemeItems.map((item) => (
                <ThemeButton
                  key={item.key}
                  isActive={item.isActive}
                  label={item.label}
                  truncate={item.truncate}
                  onClick={item.onSelect}
                >
                  {item.preview}
                </ThemeButton>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Presets ── */}
      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
          Presets
        </h3>
        <div className={gridClass}>
          {filteredPresetItems.map((item) => (
            <ThemeButton
              key={item.key}
              isActive={item.isActive}
              label={item.label}
              truncate={item.truncate}
              onClick={item.onSelect}
            >
              {item.preview}
            </ThemeButton>
          ))}
        </div>
      </div>

      {/* ── Builder Dialog ── */}
      <Dialog open={builderOpen ?? false} onOpenChange={(open) => onBuilderOpenChange?.(open)}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md max-h-[85vh] overflow-y-auto rounded-lg">
          <DialogHeader>
            <DialogTitle>{editingTheme ? 'Edit Theme' : 'New Theme'}</DialogTitle>
            <DialogDescription>
              {editingTheme
                ? `Editing "${editingTheme.title}"`
                : 'Customize colors, font, and background for your theme'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Colors */}
            <div className="flex items-start justify-center gap-6">
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

            {/* Auto-share toggle */}
            {user && (
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-share-theme-dialog" className="flex flex-col gap-1 cursor-pointer">
                    <span className="text-sm font-medium">Share theme on your profile</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      Automatically publish theme changes to your profile
                    </span>
                  </Label>
                  <Switch
                    id="auto-share-theme-dialog"
                    checked={autoShareTheme}
                    onCheckedChange={setAutoShareTheme}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {user && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col gap-2">
                {editingTheme && (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="w-full"
                    onClick={handleUpdateTheme}
                    disabled={isPublishing}
                  >
                    <Palette className="size-3.5 mr-1.5" />
                    {isPublishing ? 'Updating...' : `Update "${editingTheme.title}"`}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handlePublishNew}
                >
                  <Palette className="size-3.5 mr-1.5" />
                  Publish New Theme
                </Button>
              </div>

              {/* Advanced section with delete */}
              {editingTheme && (
                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors group">
                    <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
                    Advanced
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="pt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleDeleteTheme}
                        disabled={isPublishing}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5 mr-1.5" />
                        Delete Theme
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

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
