import { useState, useCallback, useMemo, useEffect } from 'react';
import { useSeoMeta } from '@unhead/react';
import { ArrowLeft, RotateCcw, Wand2, Download, Upload, Save, Eye, ChevronDown, AlertTriangle, Check, Heart, MessageCircle, Repeat2, Zap } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { nip19 } from 'nostr-tools';

import { Button } from '@/components/ui/button';

import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { ColorPicker } from '@/components/ui/color-picker';
import { useTheme } from '@/hooks/useTheme';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useProfileTheme, usePublishProfileTheme } from '@/hooks/useProfileTheme';
import { themes, type ThemeTokens } from '@/themes';
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
const SIDEBAR_KEYS = [
  'sidebarBackground', 'sidebarForeground', 'sidebarPrimary', 'sidebarPrimaryForeground',
  'sidebarAccent', 'sidebarAccentForeground', 'sidebarBorder', 'sidebarRing',
] as const;

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
  sidebarBackground: 'Background',
  sidebarForeground: 'Text',
  sidebarPrimary: 'Primary',
  sidebarPrimaryForeground: 'Primary Text',
  sidebarAccent: 'Accent',
  sidebarAccentForeground: 'Accent Text',
  sidebarBorder: 'Border',
  sidebarRing: 'Focus Ring',
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

export function ThemeBuilderPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { theme: currentTheme, customTheme: savedCustomTheme, setCustomTheme } = useTheme();
  const { user } = useCurrentUser();
  const { publish: publishProfileTheme, isPending: isPublishing } = usePublishProfileTheme();

  // Check if we're importing from a profile
  const importPubkey = searchParams.get('import');

  useSeoMeta({
    title: 'Theme Builder | Ditto',
    description: 'Create and customize your profile theme',
  });

  // Working state: the tokens being edited
  const [tokens, setTokens] = useState<ThemeTokens>(() => {
    if (savedCustomTheme) return savedCustomTheme;
    if (currentTheme !== 'custom' && currentTheme in themes) {
      return themes[currentTheme as PresetName];
    }
    return themes.dark;
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
    setTokens(themes[preset]);
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
      // Force AppProvider to re-apply by changing theme
      if (currentTheme === 'custom' && savedCustomTheme) {
        setCustomTheme(savedCustomTheme);
      }
    } else {
      setPreviewing(true);
      setCustomTheme(tokens);
    }
  }, [previewing, currentTheme, savedCustomTheme, tokens, setCustomTheme]);

  // Save & publish
  const handleSave = useCallback(async () => {
    setCustomTheme(tokens);
    setPreviewing(false);

    if (user) {
      try {
        await publishProfileTheme(tokens);
        toast({ title: 'Theme saved & published', description: 'Your custom theme is now active and visible on your profile.' });
      } catch (error) {
        console.error('Failed to publish theme:', error);
        toast({ title: 'Theme saved locally', description: 'Saved but failed to publish to Nostr. Your theme is active locally.', variant: 'destructive' });
      }
    } else {
      toast({ title: 'Theme saved', description: 'Log in to publish your theme to your profile.' });
    }
  }, [tokens, user, setCustomTheme, publishProfileTheme, toast]);

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

  // Import from profile
  const [importInput, setImportInput] = useState('');
  const handleImportFromProfile = useCallback(() => {
    if (!importInput.trim()) return;
    try {
      let pubkey = importInput.trim();
      // Try to decode NIP-19
      if (pubkey.startsWith('npub1') || pubkey.startsWith('nprofile1')) {
        const decoded = nip19.decode(pubkey);
        pubkey = decoded.type === 'npub' ? decoded.data : decoded.type === 'nprofile' ? decoded.data.pubkey : pubkey;
      }
      if (/^[0-9a-f]{64}$/i.test(pubkey)) {
        navigate(`/settings/theme?import=${pubkey}`, { replace: true });
      } else {
        toast({ title: 'Invalid identifier', description: 'Enter an npub or hex pubkey.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Invalid identifier', description: 'Could not decode the Nostr identifier.', variant: 'destructive' });
    }
  }, [importInput, navigate, toast]);

  return (
    <main className="flex-1 min-w-0 sidebar:max-w-[600px] sidebar:border-l xl:border-r border-border min-h-screen">
      {/* Header */}
      <div className={cn(STICKY_HEADER_CLASS, 'flex items-center gap-4 px-4 py-3 bg-background/80 backdrop-blur-md z-10 border-b border-border')}>
        <Link to="/settings/content" className="p-2 rounded-full hover:bg-secondary transition-colors">
          <ArrowLeft className="size-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold">Theme Builder</h1>
          <p className="text-xs text-muted-foreground">Create your custom profile theme</p>
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

        {/* Sidebar colors (collapsible) */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center justify-between w-full py-2 text-sm font-semibold text-muted-foreground uppercase tracking-wider group">
            <span>Sidebar Colors</span>
            <ChevronDown className="size-4 transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 gap-3">
              {SIDEBAR_KEYS.map((key) => (
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

        {/* Live preview */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Preview</h2>
          <ThemePreview tokens={tokens} hexTokens={hexTokens} />
        </section>

        <Separator />

        {/* Import / Export */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Import & Export</h2>
          
          {/* Import from profile */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Import from a Nostr profile</Label>
            <div className="flex gap-2">
              <Input
                value={importInput}
                onChange={(e) => setImportInput(e.target.value)}
                placeholder="npub1... or hex pubkey"
                className="h-9 text-sm"
              />
              <Button variant="outline" size="sm" onClick={handleImportFromProfile} className="shrink-0">
                <Upload className="size-4 mr-1.5" />
                Import
              </Button>
            </div>
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

// ─── Live Preview Component ───────────────────────────────────────────

function ThemePreview({ tokens, hexTokens }: { tokens: ThemeTokens; hexTokens: Record<string, string> }) {
  // Build inline CSS vars for scoped preview
  const style = useMemo(() => {
    const vars: Record<string, string> = {};
    for (const [key, val] of Object.entries(tokens)) {
      const cssVar = `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
      vars[cssVar] = val;
    }
    return vars;
  }, [tokens]);

  return (
    <div style={style} className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
      {/* Mock profile banner */}
      <div
        className="h-24 relative"
        style={{
          background: `linear-gradient(135deg, ${hexTokens.primary}40, ${hexTokens.accent}40, ${hexTokens.background})`,
        }}
      >
        <div className="absolute -bottom-6 left-4">
          <div className="size-12 rounded-full border-2" style={{ borderColor: hexTokens.background, backgroundColor: hexTokens.primary }}>
            <div className="size-full rounded-full flex items-center justify-center text-sm font-bold" style={{ color: hexTokens.background }}>
              A
            </div>
          </div>
        </div>
      </div>

      {/* Mock profile info */}
      <div className="pt-8 px-4 pb-3" style={{ backgroundColor: hexTokens.background }}>
        <p className="font-semibold text-sm" style={{ color: hexTokens.foreground }}>Alice</p>
        <p className="text-xs mt-0.5" style={{ color: hexTokens.mutedForeground || hexTokens.foreground }}>Nostr enthusiast. Building cool things.</p>
      </div>

      {/* Mock note card */}
      <div className="mx-3 mb-3 rounded-lg p-3" style={{ backgroundColor: hexTokens.card, border: `1px solid ${hexTokens.border}` }}>
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="size-6 rounded-full" style={{ backgroundColor: hexTokens.muted || hexTokens.secondary }} />
          <div>
            <p className="text-xs font-medium" style={{ color: hexTokens.cardForeground }}>Bob</p>
            <p className="text-[10px]" style={{ color: hexTokens.mutedForeground }}>2h ago</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: hexTokens.cardForeground }}>
          Just discovered this amazing custom theme feature! Love how you can personalize everything.
        </p>
        <div className="flex items-center gap-4 mt-2.5 text-[10px]" style={{ color: hexTokens.mutedForeground }}>
          <span className="flex items-center gap-1 cursor-pointer hover:opacity-80"><MessageCircle className="size-3" /> 3</span>
          <span className="flex items-center gap-1 cursor-pointer hover:opacity-80"><Repeat2 className="size-3" /> 1</span>
          <span className="flex items-center gap-1 cursor-pointer hover:opacity-80"><Heart className="size-3" /> 12</span>
          <span className="flex items-center gap-1 cursor-pointer hover:opacity-80" style={{ color: hexTokens.primary }}><Zap className="size-3" /> 2.1k</span>
        </div>
      </div>

      {/* Mock buttons */}
      <div className="px-3 pb-3 flex gap-2">
        <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: hexTokens.primary, color: hexTokens.primaryForeground }}>
          Primary
        </button>
        <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: hexTokens.secondary, color: hexTokens.secondaryForeground }}>
          Secondary
        </button>
        <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: hexTokens.destructive, color: hexTokens.destructiveForeground }}>
          Destructive
        </button>
      </div>

      {/* Color swatch strip */}
      <div className="px-3 pb-3">
        <div className="flex rounded-lg overflow-hidden h-6">
          {(['background', 'foreground', 'primary', 'accent', 'card', 'muted', 'border'] as const).map((key) => (
            <div
              key={key}
              className="flex-1"
              style={{ backgroundColor: hexTokens[key] }}
              title={TOKEN_LABELS[key] || key}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
