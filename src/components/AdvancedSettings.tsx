import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Bug, RotateCcw, AlertTriangle, Server, Plus, Trash2 } from 'lucide-react';
import { nip19 } from 'nostr-tools';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { RequestToVanishDialog } from '@/components/RequestToVanishDialog';
import { useAppContext } from '@/hooks/useAppContext';
import { useShakespeare, type Model } from '@/hooks/useShakespeare';
import { useToast } from '@/hooks/useToast';
import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useBuddy } from '@/hooks/useBuddy';
import { SYSTEM_PROMPT } from '@/lib/aiChatSystemPrompt';

import type { MCPServer } from '@/contexts/AppContext';

/** The build-time default DSN from the environment variable. */
const DEFAULT_SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN || '';

export function AdvancedSettings() {
  const { config, updateConfig } = useAppContext();
  const { toast } = useToast();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();
  const { getAvailableModels } = useShakespeare();
  const [aiOpen, setAiOpen] = useState(false);
  const [aiModels, setAiModels] = useState<Model[]>([]);
  const [aiModelsLoading, setAiModelsLoading] = useState(false);
  const [systemOpen, setSystemOpen] = useState(true);
  const [sentryOpen, setSentryOpen] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [vanishDialogOpen, setVanishDialogOpen] = useState(false);
  const [mcpServerName, setMcpServerName] = useState('');
  const [mcpServerUrl, setMcpServerUrl] = useState('');
  const [statsPubkey, setStatsPubkey] = useState(config.nip85StatsPubkey);
  const [faviconUrl, setFaviconUrl] = useState(config.faviconUrl);
  const [linkPreviewUrl, setLinkPreviewUrl] = useState(config.linkPreviewUrl);
  const [corsProxy, setCorsProxy] = useState(config.corsProxy);
  const [sentryDsn, setSentryDsn] = useState(config.sentryDsn);
  const { buddy, hasBuddy, updateSoul, resetBuddy } = useBuddy();
  const [soulDraft, setSoulDraft] = useState('');
  const [soulSaving, setSoulSaving] = useState(false);
  const [systemPromptDraft, setSystemPromptDraft] = useState(config.aiSystemPrompt || (SYSTEM_PROMPT.content as string));

  // Sync soul draft with buddy data
  useEffect(() => {
    if (buddy?.soul) setSoulDraft(buddy.soul);
  }, [buddy?.soul]);

  // Fetch AI models when the section opens
  useEffect(() => {
    if (!aiOpen || !user || aiModels.length > 0) return;
    let cancelled = false;
    setAiModelsLoading(true);
    getAvailableModels()
      .then((response) => {
        if (cancelled) return;
        const sorted = response.data.sort((a, b) => {
          const costA = parseFloat(a.pricing.prompt) + parseFloat(a.pricing.completion);
          const costB = parseFloat(b.pricing.prompt) + parseFloat(b.pricing.completion);
          return costA - costB;
        });
        setAiModels(sorted);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setAiModelsLoading(false); });
    return () => { cancelled = true; };
  }, [aiOpen, user, aiModels.length, getAvailableModels]);

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
    <div>
      {/* Buddy AI Section */}
      {user && (
        <div>
          <Collapsible open={aiOpen} onOpenChange={setAiOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="text-base font-semibold">Buddy</span>
                {aiOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 py-4 space-y-4 border-b border-border">
                <div className="space-y-2">
                  <Label htmlFor="ai-model">Model</Label>
                  <Select
                    value={config.aiModel || (aiModels.length > 0 ? aiModels[0].id : '')}
                    onValueChange={(value) => {
                      updateConfig(() => ({ aiModel: value }));
                      toast({ title: 'AI model updated' });
                    }}
                    disabled={aiModelsLoading || aiModels.length === 0}
                  >
                    <SelectTrigger id="ai-model">
                      <SelectValue placeholder={aiModelsLoading ? 'Loading models...' : 'Select model'} />
                    </SelectTrigger>
                    <SelectContent>
                      {aiModels.map((model) => {
                        const totalCost = parseFloat(model.pricing.prompt) + parseFloat(model.pricing.completion);
                        const isFree = totalCost === 0;
                        return (
                          <SelectItem key={model.id} value={model.id}>
                            <span className="flex items-center gap-1.5">
                              {model.name}
                              {isFree && (
                                <span className="text-[10px] font-medium text-green-600 dark:text-green-400 bg-green-500/10 px-1 rounded">
                                  FREE
                                </span>
                              )}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Choose which AI model your buddy uses for chat responses.
                  </p>
                </div>

                {/* Buddy Identity */}
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

                    {/* Soul */}
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

                {/* System Prompt */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <Label htmlFor="ai-system-prompt">System Prompt</Label>
                  <Textarea
                    id="ai-system-prompt"
                    value={systemPromptDraft}
                    onChange={(e) => setSystemPromptDraft(e.target.value)}
                    onBlur={() => {
                      const trimmed = systemPromptDraft.trim();
                      const defaultPrompt = SYSTEM_PROMPT.content as string;
                      // Store empty string when it matches the default (no override)
                      const valueToStore = trimmed === defaultPrompt ? '' : trimmed;
                      if (valueToStore !== config.aiSystemPrompt) {
                        updateConfig(() => ({ aiSystemPrompt: valueToStore }));
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
                        setSystemPromptDraft(SYSTEM_PROMPT.content as string);
                        updateConfig(() => ({ aiSystemPrompt: '' }));
                        toast({ title: 'System prompt reset to default' });
                      }}
                    >
                      <RotateCcw className="h-3 w-3 mr-1" />
                      Reset to default
                    </Button>
                  )}
                </div>

                {/* MCP Servers */}
                <div className="space-y-3 pt-2 border-t border-border">
                  <Label className="text-sm font-medium">MCP Servers</Label>
                  <p className="text-xs text-muted-foreground">
                    Connect to MCP servers to give your buddy additional tools (web fetching, search, etc.).
                  </p>

                  {/* Existing servers list */}
                  {Object.entries(config.mcpServers).length > 0 && (
                    <div className="space-y-2">
                      {Object.entries(config.mcpServers).map(([name, server]) => (
                        <div key={name} className="flex items-center gap-2 rounded-md border border-border p-2">
                          <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{name}</p>
                            <p className="text-xs text-muted-foreground truncate">{server.url}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                              const updated = { ...config.mcpServers };
                              delete updated[name];
                              updateConfig(() => ({ mcpServers: updated }));
                              toast({ title: `Removed "${name}" MCP server` });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add new server */}
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        value={mcpServerName}
                        onChange={(e) => setMcpServerName(e.target.value)}
                        placeholder="Name (e.g. web-tools)"
                        className="flex-1 text-base md:text-sm"
                      />
                      <Input
                        value={mcpServerUrl}
                        onChange={(e) => setMcpServerUrl(e.target.value)}
                        placeholder="https://mcp.example.com/mcp"
                        className="flex-[2] font-mono text-base md:text-sm"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0"
                        disabled={!mcpServerName.trim() || !mcpServerUrl.trim() || !!config.mcpServers[mcpServerName.trim()]}
                        onClick={() => {
                          const name = mcpServerName.trim();
                          const server: MCPServer = { type: 'streamable-http', url: mcpServerUrl.trim() };
                          updateConfig(() => ({ mcpServers: { ...config.mcpServers, [name]: server } }));
                          setMcpServerName('');
                          setMcpServerUrl('');
                          toast({ title: `Added "${name}" MCP server` });
                        }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {mcpServerName.trim() && config.mcpServers[mcpServerName.trim()] && (
                      <p className="text-xs text-destructive">A server with this name already exists</p>
                    )}
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      )}

      {/* System Section (includes Stats Source) */}
      <div>
        <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="text-base font-semibold">System</span>
              {systemOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5">

              {/* Stats Source */}
              <div>
                <Label htmlFor="stats-pubkey" className="text-sm font-medium">
                  NIP-85 Stats Pubkey
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Trusted pubkey for pre-computed engagement stats (likes, reposts, comments).
                </p>
                <Input
                  id="stats-pubkey"
                  value={statsPubkey}
                  onChange={(e) => handleStatsPubkeyChange(e.target.value)}
                  placeholder="Enter 64-character hex pubkey"
                  className="font-mono text-base md:text-sm"
                  maxLength={64}
                />
                {statsPubkey && statsPubkey.length !== 64 && (
                  <p className="text-xs text-destructive mt-1">
                    Pubkey must be exactly 64 hexadecimal characters
                  </p>
                )}
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">5f68e85ee174102ca8978eef302129f081f03456c884185d5ec1c1224ab633ea</span>
                </div>
              </div>

              {/* Favicon URL */}
              <div>
                <Label htmlFor="favicon-url" className="text-sm font-medium">
                  Favicon URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  URI template for fetching site favicons. Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{href}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.
                </p>
                <Input
                  id="favicon-url"
                  value={faviconUrl}
                  onChange={(e) => setFaviconUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = faviconUrl.trim();
                    if (trimmed && trimmed !== config.faviconUrl) {
                      updateConfig(() => ({ faviconUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ faviconUrl: trimmed });
                      toast({ title: 'Favicon URL updated' });
                    }
                  }}
                  placeholder="https://ditto.pub/api/favicon/{hostname}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://ditto.pub/api/favicon/{'{hostname}'}</span>
                </div>
              </div>

              {/* Link Preview URL */}
              <div>
                <Label htmlFor="link-preview-url" className="text-sm font-medium">
                  Link Preview URL
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  URI template for fetching link previews (returns OEmbed JSON). Supports RFC 6570 variables: <code className="bg-muted px-1 rounded">{'{url}'}</code>, <code className="bg-muted px-1 rounded">{'{hostname}'}</code>, <code className="bg-muted px-1 rounded">{'{origin}'}</code>, etc.
                </p>
                <Input
                  id="link-preview-url"
                  value={linkPreviewUrl}
                  onChange={(e) => setLinkPreviewUrl(e.target.value)}
                  onBlur={async () => {
                    const trimmed = linkPreviewUrl.trim();
                    if (trimmed && trimmed !== config.linkPreviewUrl) {
                      updateConfig(() => ({ linkPreviewUrl: trimmed }));
                      if (user) await updateSettings.mutateAsync({ linkPreviewUrl: trimmed });
                      toast({ title: 'Link preview URL updated' });
                    }
                  }}
                  placeholder="https://ditto.pub/api/link-preview/{url}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://ditto.pub/api/link-preview/{'{url}'}</span>
                </div>
              </div>

              {/* CORS Proxy */}
              <div>
                <Label htmlFor="cors-proxy" className="text-sm font-medium">
                  CORS Proxy
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Proxy for cross-origin requests (NIP-05 fallback). Use <code className="bg-muted px-1 rounded">{'{href}'}</code> as a placeholder for the target URL.
                </p>
                <Input
                  id="cors-proxy"
                  value={corsProxy}
                  onChange={(e) => setCorsProxy(e.target.value)}
                  onBlur={async () => {
                    const trimmed = corsProxy.trim();
                    if (trimmed && trimmed !== config.corsProxy) {
                      updateConfig(() => ({ corsProxy: trimmed }));
                      if (user) await updateSettings.mutateAsync({ corsProxy: trimmed });
                      toast({ title: 'CORS proxy updated' });
                    }
                  }}
                  placeholder="https://proxy.shakespeare.diy/?url={href}"
                  className="font-mono text-base md:text-sm"
                />
                <div className="text-xs text-muted-foreground mt-2">
                  <span className="font-medium">Default: </span>
                  <span className="font-mono break-all">https://proxy.shakespeare.diy/?url={'{href}'}</span>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Error Reporting Section */}
      <div>
        <Collapsible open={sentryOpen} onOpenChange={setSentryOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
            >
              <span className="flex items-center gap-2 text-base font-semibold">
                <Bug className="h-4 w-4" />
                Error Reporting
              </span>
              {sentryOpen ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pt-3 pb-4 space-y-5">

              {/* Share error reports toggle */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label htmlFor="sentry-enabled" className="text-sm font-medium">
                    Share error reports
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Help improve this app by automatically sending crash and error reports.
                  </p>
                </div>
                <Switch
                  id="sentry-enabled"
                  checked={config.sentryEnabled}
                  onCheckedChange={(checked) => {
                    updateConfig((current) => ({ ...current, sentryEnabled: checked }));
                  }}
                />
              </div>

              {/* Sentry DSN */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="sentry-dsn" className="text-sm font-medium">
                    Sentry DSN
                    {sentryDsn !== DEFAULT_SENTRY_DSN && (
                      <span className="ml-2 inline-block w-2 h-2 rounded-full bg-yellow-400" title="Modified from default" />
                    )}
                  </Label>
                  {sentryDsn !== DEFAULT_SENTRY_DSN && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0"
                      title="Restore to default"
                      onClick={async () => {
                        setSentryDsn(DEFAULT_SENTRY_DSN);
                        updateConfig((current) => ({ ...current, sentryDsn: DEFAULT_SENTRY_DSN }));
                        if (user) await updateSettings.mutateAsync({ sentryDsn: DEFAULT_SENTRY_DSN });
                        toast({ title: 'Sentry DSN restored to default' });
                      }}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  Sentry Data Source Name (DSN) for error reporting. Leave empty to disable Sentry.
                </p>
                <Input
                  id="sentry-dsn"
                  value={sentryDsn}
                  onChange={(e) => setSentryDsn(e.target.value)}
                  onBlur={async () => {
                    const trimmed = sentryDsn.trim();
                    if (trimmed !== config.sentryDsn) {
                      updateConfig((current) => ({ ...current, sentryDsn: trimmed }));
                      if (user) await updateSettings.mutateAsync({ sentryDsn: trimmed });
                      toast({ title: trimmed ? 'Sentry DSN updated' : 'Sentry DSN cleared' });
                    }
                  }}
                  placeholder="https://examplePublicKey@o0.ingest.sentry.io/0"
                  className="font-mono text-base md:text-sm"
                />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Danger Zone Section — only when logged in */}
      {user && (
        <div>
          <Collapsible open={dangerOpen} onOpenChange={setDangerOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="relative w-full justify-between px-3 py-3.5 h-auto hover:bg-muted/20 hover:text-foreground rounded-none"
              >
                <span className="flex items-center gap-2 text-base font-semibold text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  Danger Zone
                </span>
                {dangerOpen ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-destructive rounded-full" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-3 pt-3 pb-4 space-y-4">
                {/* Reset Buddy */}
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
                      variant="outline"
                      size="sm"
                      className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                      onClick={async () => {
                        try {
                          await resetBuddy.mutateAsync();
                          toast({ title: 'Buddy has been reset' });
                        } catch {
                          toast({ title: 'Failed to reset buddy', variant: 'destructive' });
                        }
                      }}
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
                    variant="outline"
                    size="sm"
                    className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => setVanishDialogOpen(true)}
                  >
                    Delete Account
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          <RequestToVanishDialog
            open={vanishDialogOpen}
            onOpenChange={setVanishDialogOpen}
          />
        </div>
      )}
    </div>
  );
}
