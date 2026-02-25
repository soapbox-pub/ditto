import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, RotateCcw, Wand2, Download, Upload, Save, Eye, ChevronDown, AlertTriangle, Check, Heart, MessageCircle, Repeat2, Zap, Globe, Users, Flame, MoreHorizontal } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { ColorPicker } from '@/components/ui/color-picker';
import { useTheme } from '@/hooks/useTheme';
import { useAuthor } from '@/hooks/useAuthor';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileTheme, usePublishProfileTheme } from '@/hooks/useProfileTheme';
import { builtinThemes, themePresets, type ThemeTokens } from '@/themes';
import { hslStringToHex, hexToHslString, deriveTokensFromCore, getContrastRatioHsl } from '@/lib/colorUtils';
import { cn, STICKY_HEADER_CLASS } from '@/lib/utils';

type PresetName = 'dark' | 'light' | 'black' | 'pink';

const PRESETS: { value: PresetName; label: string; preview: string }[] = [
  { value: 'light', label: 'Light', preview: 'bg-white border border-border' },
  { value: 'dark', label: 'Dark', preview: 'bg-[hsl(228,20%,10%)]' },
  { value: 'black', label: 'Black', preview: 'bg-black' },
  { value: 'pink', label: 'Pink', preview: 'bg-[hsl(330,100%,96%)]' },
];

/** Core color keys exposed in the simple editor */
const CORE_KEYS = ['background', 'foreground', 'primary', 'accent'] as const;

/** Surface color keys in the advanced section */
const SURFACE_KEYS = [
  'card', 'cardForeground', 'popover', 'popoverForeground',
  'muted', 'mutedForeground', 'secondary', 'secondaryForeground',
] as const;

/** UI color keys */
const UI_KEYS = ['border', 'input', 'ring', 'destructive', 'destructiveForeground'] as const;

/** Sidebar keys */
/** Human-readable labels for token keys */
const TOKEN_LABELS: Record<string, string> = {
  background: 'Background',
  foreground: 'Text',
  primary: 'Primary',
  accent: 'Accent',
  card: 'Card',
  cardForeground: 'Card Text',
  popover: 'Popover',
  popoverForeground: 'Popover Text',
  muted: 'Muted',
  mutedForeground: 'Muted Text',
  secondary: 'Secondary',
  secondaryForeground: 'Secondary Text',
  border: 'Border',
  input: 'Input Border',
  ring: 'Focus Ring',
  destructive: 'Destructive',
  destructiveForeground: 'Destructive Text',
};

/** Pairs to check contrast on */
const CONTRAST_PAIRS: [keyof ThemeTokens, keyof ThemeTokens, string][] = [
  ['foreground', 'background', 'Text on Background'],
  ['primaryForeground', 'primary', 'Text on Primary'],
  ['cardForeground', 'card', 'Text on Card'],
  ['mutedForeground', 'muted', 'Muted Text on Muted'],
  ['accentForeground', 'accent', 'Text on Accent'],
  ['destructiveForeground', 'destructive', 'Text on Destructive'],
];

/** Resolve a preset name to its ThemeTokens */
function getPresetTokens(preset: PresetName): ThemeTokens {
  if (preset === 'light' || preset === 'dark') {
    return builtinThemes[preset];
  }
  return themePresets[preset]?.tokens ?? builtinThemes.dark;
}

export function ThemeBuilderPage() {
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { theme: currentTheme, customTheme: savedCustomTheme, applyCustomTheme } = useTheme();
  const { user } = useCurrentUser();
  const { publish: publishProfileTheme, isPending: isPublishing } = usePublishProfileTheme();

  // Check if we're importing from a profile
  const importPubkey = searchParams.get('import');

  // Check if the user currently has a published profile theme
  const ownProfileTheme = useProfileTheme(user?.pubkey);
  const hasPublishedTheme = !!ownProfileTheme.data;

  useSeoMeta({
    title: 'Theme Builder | Ditto',
    description: 'Create and customize your profile theme',
  });

  // Working state: the tokens being edited
  const [tokens, setTokens] = useState<ThemeTokens>(() => {
    if (savedCustomTheme) return savedCustomTheme;
    if (currentTheme === 'light' || currentTheme === 'dark') {
      return builtinThemes[currentTheme];
    }
    return builtinThemes.dark;
  });
  const [autoDerive, setAutoDerive] = useState(true);
  const [previewing, setPreviewing] = useState(false);

  // Import from another user's profile theme
  const importQuery = useProfileTheme(importPubkey ?? undefined);
  useEffect(() => {
    if (importQuery.data?.tokens) {
      setTokens(importQuery.data.tokens);
      setAutoDerive(false); // imported themes have specific tokens
      toast({ title: 'Theme imported', description: 'Imported theme from profile. Customize it and save!' });
    }
  }, [importQuery.data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hex representations of current tokens for color pickers
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

  // Update a single token
  const updateToken = useCallback((key: keyof ThemeTokens, hex: string) => {
    const hsl = hexToHslString(hex);

    if (autoDerive && CORE_KEYS.includes(key as (typeof CORE_KEYS)[number])) {
      // Re-derive all tokens from the 4 core colors
      const newCore = { ...tokens, [key]: hsl };
      const derived = deriveTokensFromCore(
        newCore.background,
        newCore.foreground,
        newCore.primary,
        newCore.accent,
      );
      setTokens(derived);
    } else {
      setTokens((prev) => ({ ...prev, [key]: hsl }));
    }
  }, [autoDerive, tokens]);

  // Apply preset
  const applyPreset = useCallback((preset: PresetName) => {
    setTokens(getPresetTokens(preset));
    setAutoDerive(true);
  }, []);

  // Contrast warnings
  const contrastWarnings = useMemo(() => {
    return CONTRAST_PAIRS.map(([fg, bg, label]) => {
      const ratio = getContrastRatioHsl(tokens[fg], tokens[bg]);
      return { label, ratio, passes: ratio >= 4.5 };
    });
  }, [tokens]);

  const failingContrasts = contrastWarnings.filter((w) => !w.passes);

  // Preview: temporarily apply tokens to the document
  const togglePreview = useCallback(() => {
    if (previewing) {
      // Revert: re-apply the saved theme
      setPreviewing(false);
      if (currentTheme === 'custom' && savedCustomTheme) {
        applyCustomTheme(savedCustomTheme);
      }
    } else {
      setPreviewing(true);
      applyCustomTheme(tokens);
    }
  }, [previewing, currentTheme, savedCustomTheme, tokens, applyCustomTheme]);

  // Save & optionally re-publish
  const handleSave = useCallback(async () => {
    applyCustomTheme(tokens);
    setPreviewing(false);

    // If user has a published profile theme, auto-republish with updated tokens
    if (user && hasPublishedTheme) {
      try {
        await publishProfileTheme(tokens);
        toast({ title: 'Theme saved & published', description: 'Your custom theme is now active and updated on your profile.' });
      } catch (error) {
        console.error('Failed to republish theme:', error);
        toast({ title: 'Theme saved locally', description: 'Saved but failed to update your profile theme.', variant: 'destructive' });
      }
    } else {
      toast({ title: 'Theme saved', description: 'Your custom theme is now active.' });
    }
  }, [tokens, user, hasPublishedTheme, applyCustomTheme, publishProfileTheme, toast]);

  // Export/import JSON
  const handleExport = useCallback(() => {
    const json = JSON.stringify(tokens, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ditto-theme.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [tokens]);

  const handleImportFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(reader.result as string) as ThemeTokens;
        if (imported.background && imported.foreground && imported.primary) {
          setTokens(imported);
          setAutoDerive(false);
          toast({ title: 'Theme imported', description: 'JSON theme loaded successfully.' });
        } else {
          toast({ title: 'Invalid theme', description: 'The file does not contain valid theme tokens.', variant: 'destructive' });
        }
      } catch {
        toast({ title: 'Import failed', description: 'Could not parse the JSON file.', variant: 'destructive' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [toast]);

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Header */}
      <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 py-3 bg-background/80 backdrop-blur-md z-10 border-b border-border')}>
        <Link to="/settings/appearance" className="p-2 rounded-full hover:bg-secondary transition-colors">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">Theme Builder</h1>
          <p className="text-xs text-muted-foreground">Create your custom theme</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={togglePreview}>
            <Eye className="size-4 mr-1.5" />
            {previewing ? 'Revert' : 'Preview'}
          </Button>
          <Button size="sm" onClick={handleSave} disabled={isPublishing}>
            <Save className="size-4 mr-1.5" />
            {isPublishing ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Preset selector */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Start from a preset</h2>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => applyPreset(preset.value)}
                className={cn(
                  'flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200 hover:bg-muted/50',
                  'ring-1 ring-border hover:ring-primary/50',
                )}
              >
                <div className={cn('size-10 rounded-full', preset.preview)} />
                <span className="text-xs font-medium">{preset.label}</span>
              </button>
            ))}
          </div>
        </section>

        <Separator />

        {/* Auto-derive toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Wand2 className="size-4 text-primary" />
              Auto-derive colors
            </Label>
            <p className="text-xs text-muted-foreground">Automatically generate surface and UI colors from core colors</p>
          </div>
          <Switch checked={autoDerive} onCheckedChange={setAutoDerive} />
        </div>

        <Separator />

        {/* Core colors */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Core Colors</h2>
          <div className="grid grid-cols-2 gap-3">
            {CORE_KEYS.map((key) => (
              <ColorPicker
                key={key}
                label={TOKEN_LABELS[key]}
                value={hexTokens[key] || '#000000'}
                onChange={(hex) => updateToken(key, hex)}
              />
            ))}
          </div>
        </section>

        {/* Surface colors (collapsible) */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider group">
            <span>Surface Colors</span>
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 gap-3">
              {SURFACE_KEYS.map((key) => (
                <ColorPicker
                  key={key}
                  label={TOKEN_LABELS[key]}
                  value={hexTokens[key] || '#000000'}
                  onChange={(hex) => updateToken(key, hex)}
                  disabled={autoDerive}
                />
              ))}
            </div>
            {autoDerive && (
              <p className="text-xs text-muted-foreground mt-2 italic">
                These colors are auto-derived. Turn off auto-derive to edit them individually.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* UI colors (collapsible) */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider group">
            <span>UI Colors</span>
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 gap-3">
              {UI_KEYS.map((key) => (
                <ColorPicker
                  key={key}
                  label={TOKEN_LABELS[key]}
                  value={hexTokens[key] || '#000000'}
                  onChange={(hex) => updateToken(key, hex)}
                  disabled={autoDerive}
                />
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Separator />

        {/* Live preview */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Preview</h2>
          <ThemePreview tokens={tokens} hexTokens={hexTokens} />
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

        {/* Profile Publishing Status */}
        {user && (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Profile Sharing</h2>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Globe className="size-4 text-primary" />
                    <span className="text-sm font-medium">
                      {hasPublishedTheme ? 'Published to profile' : 'Not shared'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hasPublishedTheme
                      ? 'Your theme is visible when others visit your profile. Saving will auto-update it.'
                      : 'Enable sharing in Edit Profile to display your theme on your profile.'}
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
      </div>
    </main>
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
      // Try to decode NIP-19
      if (pubkey.startsWith('npub1') || pubkey.startsWith('nprofile1')) {
        const decoded = nip19.decode(pubkey);
        pubkey = decoded.type === 'npub' ? decoded.data : decoded.type === 'nprofile' ? decoded.data.pubkey : pubkey;
      }
      if (/^[0-9a-f]{64}$/i.test(pubkey)) {
        // Navigate with import param (page will reload with the query)
        window.location.href = `/settings/theme?import=${pubkey}`;
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

function ThemePreview({ hexTokens }: { tokens: ThemeTokens; hexTokens: Record<string, string> }) {
  const { user } = useCurrentUser();
  const author = useAuthor(user?.pubkey);
  const metadata = author.data?.metadata;

  // Real user data with fallbacks
  const displayName = metadata?.name || metadata?.display_name || 'Alice';
  const handle = metadata?.nip05?.split('@')[0] || metadata?.name?.toLowerCase() || 'alice';
  const bio = metadata?.about || 'Nostr enthusiast. Building cool things on the decentralized web.';
  const avatar = metadata?.picture;
  const banner = metadata?.banner;
  const initial = displayName[0]?.toUpperCase() || 'A';

  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: hexTokens.border, backgroundColor: hexTokens.background }}>

      {/* ── Profile Header ── */}

      {/* Banner */}
      <div className="h-32 relative" style={{ backgroundColor: hexTokens.secondary }}>
        {banner && (
          <img src={banner} alt="" className="w-full h-full object-cover" />
        )}
      </div>

      {/* Profile info */}
      <div className="px-4 pb-3" style={{ backgroundColor: hexTokens.background }}>
        {/* Avatar + action buttons row */}
        <div className="flex justify-between items-start -mt-10 mb-2">
          {/* Avatar */}
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
          {/* Action buttons */}
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

        {/* Name & handle */}
        <p className="text-lg font-bold truncate" style={{ color: hexTokens.foreground }}>{displayName}</p>
        <p className="text-xs" style={{ color: hexTokens.mutedForeground }}>@{handle}</p>

        {/* Stats row */}
        <div className="flex items-center gap-4 mt-1.5">
          <span className="flex items-center gap-1">
            <Users className="size-3.5" style={{ color: hexTokens.primary }} />
            <span className="text-xs font-bold" style={{ color: hexTokens.primary }}>142</span>
            <span className="text-xs" style={{ color: hexTokens.mutedForeground }}>following</span>
          </span>
          <span className="flex items-center gap-1">
            <Flame className="size-3.5" style={{ color: hexTokens.primary }} />
            <span className="text-xs font-bold" style={{ color: hexTokens.foreground }}>7</span>
          </span>
        </div>

        {/* Bio */}
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

      {/* ── Note Card (as if posted by this user) ── */}
      <div
        className="px-4 py-3"
        style={{ borderBottom: `1px solid ${hexTokens.border}`, backgroundColor: hexTokens.background }}
      >
        {/* Author row */}
        <div className="flex items-center gap-2.5">
          {avatar ? (
            <img
              src={avatar}
              alt={displayName}
              className="size-10 rounded-full object-cover shrink-0"
            />
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

        {/* Note content */}
        <p className="mt-2 text-sm leading-relaxed" style={{ color: hexTokens.foreground }}>
          Just updated my custom theme! Love how you can personalize everything on Nostr. 🎨
        </p>

        {/* Action buttons */}
        <div className="flex items-center gap-5 mt-2.5 -ml-2">
          <span className="flex items-center gap-1.5 p-1.5 rounded-full" style={{ color: hexTokens.mutedForeground }}>
            <MessageCircle className="size-4" /> <span className="text-xs">3</span>
          </span>
          <span className="flex items-center gap-1.5 p-1.5 rounded-full" style={{ color: '#22c55e' }}>
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

      {/* ── Second Note (partial, to show feed continuity) ── */}
      <div
        className="px-4 py-3"
        style={{ backgroundColor: hexTokens.background }}
      >
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
