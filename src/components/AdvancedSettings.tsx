import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Bug, RotateCcw, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { RequestToVanishDialog } from '@/components/RequestToVanishDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBuddy } from '@/hooks/useBuddy';
import { DEFAULT_SYSTEM_PROMPT_TEMPLATE } from '@/lib/aiChatSystemPrompt';

/** Hardcoded default values for buddy provider fields. Used for "Reset" buttons. */
const DEFAULT_AI_BASE_URL = 'https://ai.shakespeare.diy/v1';
const DEFAULT_AI_MODEL = 'grok-4.1-fast';

/** The build-time default DSN from the environment variable. */
const DEFAULT_SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function AdvancedSettings() {
  const { user } = useCurrentUser();

  return (
    <div>
      {user && <BuddySettingsSection />}
      <SystemSettingsSection />
      <SentrySettingsSection />
      {user && <DangerSettingsSection />}
    </div>
  );
}

// ── Section components ────────────────────────────────────────────────────────

function SettingsSection({
  title, icon, open, onOpenChange, accentColor, children,
}: {
  title: string; icon?: React.ReactNode; open: boolean; onOpenChange: (v: boolean) => void;
  accentColor?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
          >
            <span className={`flex items-center gap-2 text-base font-semibold ${accentColor ?? ''}`}>
              {icon}
              {title}
            </span>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <div className={`absolute bottom-0 left-0 right-0 h-1 rounded-full ${accentColor === 'text-destructive' ? 'bg-destructive' : 'bg-primary'}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {children}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function BuddySettingsSection() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { buddy, hasBuddy, updateSoul } = useBuddy();
  const [open, setOpen] = useState(false);
  const [soulDraft, setSoulDraft] = useState('');
  const [soulSaving, setSoulSaving] = useState(false);
  const [baseUrlDraft, setBaseUrlDraft] = useState(config.aiBaseURL);
  const [apiKeyDraft, setApiKeyDraft] = useState(config.aiApiKey);
  const [modelDraft, setModelDraft] = useState(config.aiModel);
  const [showApiKey, setShowApiKey] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState(config.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT_TEMPLATE);

  useEffect(() => {
    if (buddy?.soul) setSoulDraft(buddy.soul);
  }, [buddy?.soul]);

  // Keep drafts in sync when config changes from elsewhere (e.g. reset).
  useEffect(() => { setBaseUrlDraft(config.aiBaseURL); }, [config.aiBaseURL]);
  useEffect(() => { setApiKeyDraft(config.aiApiKey); }, [config.aiApiKey]);
  useEffect(() => { setModelDraft(config.aiModel); }, [config.aiModel]);

  const commitBaseUrl = () => {
    const trimmed = baseUrlDraft.trim().replace(/\/+$/, '');
    if (!trimmed) {
      // Empty => restore default so there is always a working endpoint.
      setBaseUrlDraft(DEFAULT_AI_BASE_URL);
      if (config.aiBaseURL !== DEFAULT_AI_BASE_URL) {
        updateConfig((current) => ({ ...current, aiBaseURL: DEFAULT_AI_BASE_URL }));
        toast({ title: 'Base URL reset to default' });
      }
      return;
    }
    if (trimmed !== config.aiBaseURL) {
      updateConfig((current) => ({ ...current, aiBaseURL: trimmed }));
      toast({ title: 'AI base URL updated' });
    }
  };

  const commitApiKey = () => {
    const trimmed = apiKeyDraft.trim();
    if (trimmed !== config.aiApiKey) {
      updateConfig((current) => ({ ...current, aiApiKey: trimmed }));
      toast({ title: trimmed ? 'API key updated' : 'API key cleared (using NIP-98 auth)' });
    }
  };

  const commitModel = () => {
    const trimmed = modelDraft.trim();
    if (!trimmed) {
      // Empty => restore default model so the chat isn't broken.
      setModelDraft(DEFAULT_AI_MODEL);
      if (config.aiModel !== DEFAULT_AI_MODEL) {
        updateConfig((current) => ({ ...current, aiModel: DEFAULT_AI_MODEL }));
        toast({ title: 'Model reset to default' });
      }
      return;
    }
    if (trimmed !== config.aiModel) {
      updateConfig((current) => ({ ...current, aiModel: trimmed }));
      toast({ title: 'AI model updated' });
    }
  };

  const resetProviderDefaults = () => {
    setBaseUrlDraft(DEFAULT_AI_BASE_URL);
    setApiKeyDraft('');
    setModelDraft(DEFAULT_AI_MODEL);
    updateConfig((current) => ({
      ...current,
      aiBaseURL: DEFAULT_AI_BASE_URL,
      aiApiKey: '',
      aiModel: DEFAULT_AI_MODEL,
    }));
    toast({ title: 'Provider settings reset to defaults' });
  };

  const providerIsDefault =
    config.aiBaseURL === DEFAULT_AI_BASE_URL &&
    config.aiApiKey === '' &&
    config.aiModel === DEFAULT_AI_MODEL;

  return (
    <SettingsSection title="Buddy" open={open} onOpenChange={setOpen}>
      <div className="px-4 py-4 space-y-4 border-b border-border">
        <div className="space-y-2">
          <Label htmlFor="ai-base-url">Base URL</Label>
          <Input
            id="ai-base-url"
            type="url"
            value={baseUrlDraft}
            onChange={(e) => setBaseUrlDraft(e.target.value)}
            onBlur={commitBaseUrl}
            placeholder={DEFAULT_AI_BASE_URL}
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            OpenAI-compatible <code className="bg-muted px-1 rounded">/v1</code> endpoint. An API key is required for endpoints that don't support NIP-98 auth.
          </p>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <Label htmlFor="ai-api-key">API key</Label>
          <div className="flex gap-2">
            <Input
              id="ai-api-key"
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyDraft}
              onChange={(e) => setApiKeyDraft(e.target.value)}
              onBlur={commitApiKey}
              placeholder="Leave empty to use NIP-98 auth"
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setShowApiKey((v) => !v)}
              aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
            >
              {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Optional. Required for endpoints that use standard API-key auth (e.g. OpenAI, Anthropic, OpenRouter).
          </p>
        </div>

        <div className="space-y-2 pt-2 border-t border-border">
          <Label htmlFor="ai-model">Model</Label>
          <Input
            id="ai-model"
            type="text"
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={commitModel}
            placeholder={DEFAULT_AI_MODEL}
            className="font-mono text-xs"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            Model ID sent to the provider (e.g. <code className="bg-muted px-1 rounded">grok-4.1-fast</code>, <code className="bg-muted px-1 rounded">claude-opus-4.6</code>, <code className="bg-muted px-1 rounded">gpt-4o</code>).
          </p>
          {!providerIsDefault && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={resetProviderDefaults}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset provider to default
            </Button>
          )}
        </div>

        {hasBuddy && buddy && (
          <div className="space-y-3 pt-2 border-t border-border">
            <Label className="text-sm font-medium">Identity</Label>
            <div className="space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-12 shrink-0">Name</span>
                <span className="font-medium">{buddy.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-12 shrink-0">npub</span>
                <span className="font-mono text-xs text-muted-foreground truncate">{nip19.npubEncode(buddy.pubkey)}</span>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label htmlFor="buddy-soul">Soul</Label>
              <Textarea
                id="buddy-soul"
                value={soulDraft}
                onChange={(e) => setSoulDraft(e.target.value)}
                onBlur={async () => {
                  const trimmed = soulDraft.trim();
                  if (trimmed && trimmed !== buddy.soul) {
                    setSoulSaving(true);
                    try {
                      await updateSoul.mutateAsync(trimmed);
                      toast({ title: 'Buddy soul updated' });
                    } catch {
                      toast({ title: 'Failed to update soul', variant: 'destructive' });
                    } finally {
                      setSoulSaving(false);
                    }
                  }
                }}
                placeholder="Describe your buddy's personality..."
                className="min-h-[100px] max-h-[400px] resize-y font-mono text-xs leading-relaxed"
                disabled={soulSaving}
              />
              <p className="text-xs text-muted-foreground">
                Your buddy's personality and behavior. Changes are saved when you click away.
              </p>
            </div>
          </div>
        )}

        {!hasBuddy && (
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              No buddy configured. Visit the Buddy page to create one.
            </p>
          </div>
        )}

        <div className="space-y-2 pt-2 border-t border-border">
          <Label htmlFor="ai-system-prompt">System Prompt</Label>
          <Textarea
            id="ai-system-prompt"
            value={systemPromptDraft}
            onChange={(e) => setSystemPromptDraft(e.target.value)}
            onBlur={() => {
              const trimmed = systemPromptDraft.trim();
              const defaultPrompt = DEFAULT_SYSTEM_PROMPT_TEMPLATE;
              const valueToStore = trimmed === defaultPrompt ? '' : trimmed;
              if (valueToStore !== config.aiSystemPrompt) {
                updateConfig((current) => ({ ...current, aiSystemPrompt: valueToStore }));
                toast({ title: valueToStore ? 'System prompt updated' : 'System prompt reset to default' });
              }
            }}
            className="min-h-[120px] max-h-[400px] resize-y font-mono text-xs leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            The base system prompt sent to the AI. Use <code className="bg-muted px-1 rounded">{'{{NAME}}'}</code> and <code className="bg-muted px-1 rounded">{'{{SOUL}}'}</code> as placeholders for your buddy's identity.
          </p>
          {config.aiSystemPrompt && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => {
                setSystemPromptDraft(DEFAULT_SYSTEM_PROMPT_TEMPLATE);
                updateConfig((current) => ({ ...current, aiSystemPrompt: '' }));
                toast({ title: 'System prompt reset to default' });
              }}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset to default
            </Button>
          )}
        </div>
      </div>
    </SettingsSection>
  );
}

function SystemSettingsSection() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(true);
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState(config.linkPreviewUrl);
  const [corsProxy, setCorsProxy] = useState(config.corsProxy);

  const handleStatsPubkeyChange = (value: string) => {
    setStatsPubkey(value);
    if (value.length === 64 && /^[0-9a-f]{64}$/i.test(value)) {
      updateConfig(() => ({ nip85StatsPubkey: value.toLowerCase() }));
      toast({ title: 'Stats source updated', description: 'Using NIP-85 stats from this pubkey.' });
    } else if (value.length === 0) {
      updateConfig(() => ({ nip85StatsPubkey: '' }));
      toast({ title: 'Stats source cleared' });
    }
  };

  return (
    <SettingsSection title="System" open={open} onOpenChange={setOpen}>
      <div className="px-3 pt-3 pb-4 space-y-5">
        <div>
          <Label htmlFor="stats-pubkey" className="text-sm font-medium">NIP-85 Stats Pubkey</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">Trusted pubkey for pre-computed engagement stats (likes, reposts, comments).</p>
          <Input id="stats-pubkey" value={statsPubkey} onChange={(e) => handleStatsPubkeyChange(e.target.value)} placeholder="Enter 64-character hex pubkey" className="font-mono text-base md:text-sm" maxLength={64} />
          {statsPubkey && statsPubkey.length !== 64 && <p className="text-xs text-destructive mt-1">Pubkey must be exactly 64 hexadecimal characters</p>}
          <div className="text-xs text-muted-foreground mt-2"><span className="font-medium">Default: </span><span className="font-mono break-all">5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea</span></div>
        </div>

        <div>
          <Label htmlFor="favicon-url" className="text-sm font-medium">Favicon URL</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">URI template for fetching site favicons. Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{href}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.</p>
          <Input id="favicon-url" value={faviconUrl} onChange={(e) => setFaviconUrl(e.target.value)} onBlur={async () => { const trimmed = faviconUrl.trim(); if (trimmed && trimmed !== config.faviconUrl) { updateConfig(() => ({ faviconUrl: trimmed })); if (user) await updateSettings.mutateAsync({ faviconUrl: trimmed }); toast({ title: 'Favicon URL updated' }); } }} placeholder="https://ditto.pub/api/favicon/{hostname}" className="font-mono text-base md:text-sm" />
          <div className="text-xs text-muted-foreground mt-2"><span className="font-medium">Default: </span><span className="font-mono break-all">https://ditto.pub/api/favicon/{'{hostname}'}</span></div>
        </div>

        <div>
          <Label htmlFor="link-preview-url" className="text-sm font-medium">Link Preview URL</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">URI template for fetching link previews (returns OEmbed JSON). Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{url}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.</p>
          <Input id="link-preview-url" value={linkPreviewUrl} onChange={(e) => setLinkPreviewUrl(e.target.value)} onBlur={async () => { const trimmed = linkPreviewUrl.trim(); if (trimmed && trimmed !== config.linkPreviewUrl) { updateConfig(() => ({ linkPreviewUrl: trimmed })); if (user) await updateSettings.mutateAsync({ linkPreviewUrl: trimmed }); toast({ title: 'Link preview URL updated' }); } }} placeholder="https://ditto.pub/api/link-preview/{url}" className="font-mono text-base md:text-sm" />
          <div className="text-xs text-muted-foreground mt-2"><span className="font-medium">Default: </span><span className="font-mono break-all">https://ditto.pub/api/link-preview/{'{url}'}</span></div>
        </div>

        <div>
          <Label htmlFor="cors-proxy" className="text-sm font-medium">CORS Proxy</Label>
          <p className="text-xs text-muted-foreground mt-1 mb-2">Proxy for cross-origin requests (NIP-05 fallback). Use <code className="bg-muted px-1 rounded">{'{href}'}</code> as a placeholder for the target URL.</p>
          <Input id="cors-proxy" value={corsProxy} onChange={(e) => setCorsProxy(e.target.value)} onBlur={async () => { const trimmed = corsProxy.trim(); if (trimmed && trimmed !== config.corsProxy) { updateConfig(() => ({ corsProxy: trimmed })); if (user) await updateSettings.mutateAsync({ corsProxy: trimmed }); toast({ title: 'CORS proxy updated' }); } }} placeholder="https://proxy.shakespeare.diy/?url={href}" className="font-mono text-base md:text-sm" />
          <div className="text-xs text-muted-foreground mt-2"><span className="font-medium">Default: </span><span className="font-mono break-all">https://proxy.shakespeare.diy/?url={'{href}'}</span></div>
        </div>
      </div>
    </SettingsSection>
  );
}

function SentrySettingsSection() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [sentryDsn, setSentryDsn] = useState(config.sentryDsn);

  return (
    <SettingsSection title="Error Reporting" icon={<Bug className="h-4 w-4" />} open={open} onOpenChange={setOpen}>
      <div className="px-3 pt-3 pb-4 space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label htmlFor="sentry-enabled" className="text-sm font-medium">Share error reports</Label>
            <p className="text-xs text-muted-foreground">Help improve this app by automatically sending crash and error reports.</p>
          </div>
          <Switch id="sentry-enabled" checked={config.sentryEnabled} onCheckedChange={(checked) => { updateConfig((current) => ({ ...current, sentryEnabled: checked })); }} />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <Label htmlFor="sentry-dsn" className="text-sm font-medium">
              Sentry DSN
              {sentryDsn !== DEFAULT_SENTRY_DSN && <span className="ml-2 inline-block w-2 h-2 rounded-full bg-yellow-400" title="Modified from default" />}
            </Label>
            {sentryDsn !== DEFAULT_SENTRY_DSN && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" title="Restore to default" onClick={async () => { setSentryDsn(DEFAULT_SENTRY_DSN); updateConfig((current) => ({ ...current, sentryDsn: DEFAULT_SENTRY_DSN })); if (user) await updateSettings.mutateAsync({ sentryDsn: DEFAULT_SENTRY_DSN }); toast({ title: 'Sentry DSN restored to default' }); }}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 mb-2">Sentry Data Source Name (DSN) for error reporting. Leave empty to disable Sentry.</p>
          <Input id="sentry-dsn" value={sentryDsn} onChange={(e) => setSentryDsn(e.target.value)} onBlur={async () => { const trimmed = sentryDsn.trim(); if (trimmed !== config.sentryDsn) { updateConfig((current) => ({ ...current, sentryDsn: trimmed })); if (user) await updateSettings.mutateAsync({ sentryDsn: trimmed }); toast({ title: trimmed ? 'Sentry DSN updated' : 'Sentry DSN cleared' }); } }} placeholder="https://examplePublicKey@o0.ingest.sentry.io/0" className="font-mono text-base md:text-sm" />
        </div>
      </div>
    </SettingsSection>
  );
}

function DangerSettingsSection() {
  const { toast } = useToast();
  const { hasBuddy, resetBuddy } = useBuddy();
  const [open, setOpen] = useState(false);
  const [vanishDialogOpen, setVanishDialogOpen] = useState(false);

  return (
    <>
      <SettingsSection title="Danger Zone" icon={<AlertTriangle className="h-4 w-4" />} accentColor="text-destructive" open={open} onOpenChange={setOpen}>
        <div className="px-3 pt-3 pb-4 space-y-4">
          {hasBuddy && (
            <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
              <div>
                <h3 className="text-sm font-medium">Reset Buddy</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Delete your buddy's identity and start over. The buddy's Nostr keypair and soul
                  will be wiped from this device and relays. This cannot be undone.
                </p>
              </div>
              <Button
                variant="outline" size="sm"
                className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                onClick={async () => { try { await resetBuddy.mutateAsync(); toast({ title: 'Buddy has been reset' }); } catch { toast({ title: 'Failed to reset buddy', variant: 'destructive' }); } }}
                disabled={resetBuddy.isPending}
              >
                {resetBuddy.isPending ? 'Resetting...' : 'Reset Buddy'}
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-destructive/30 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-medium">Delete Account</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Permanently delete your data from the network, including your profile,
                posts, reactions, and direct messages. This action is irreversible.
              </p>
            </div>
            <Button
              variant="outline" size="sm"
              className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setVanishDialogOpen(true)}
            >
              Delete Account
            </Button>
          </div>
        </div>
      </SettingsSection>

      <RequestToVanishDialog open={vanishDialogOpen} onOpenChange={setVanishDialogOpen} />
    </>
  );
}
