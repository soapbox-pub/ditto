import { useEffect, useState } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { FormattedMessage, useIntl, defineMessage, type MessageDescriptor } from 'react-intl';
import { fetchModels, type AIProvider } from '@soapbox.pub/nostr-canvas/devkit';

import { PageHeader } from '@/components/PageHeader';
import { IntroImage } from '@/components/IntroImage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useAIProviders, type AIProviderKind, type AIProviderProfile } from '@/hooks/useAIProviders';
import { useAutoDetectModels } from '@/hooks/useAutoDetectModels';
import { useAppContext } from '@/hooks/useAppContext';
import { useToast } from '@/hooks/useToast';
import { useSeoMeta } from '@/hooks/useSeoMeta';

/** Default base URL applied when a provider kind is picked in the form. */
const KIND_BASE_URLS: Record<AIProviderKind, string> = {
  openrouter: 'https://openrouter.ai/api/v1',
  'openai-compatible': 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com',
};

const KIND_LABELS: Record<AIProviderKind, MessageDescriptor> = {
  openrouter: defineMessage({ id: 'settings.ai.kind.openrouter', defaultMessage: 'OpenRouter' }),
  'openai-compatible': defineMessage({ id: 'settings.ai.kind.openaiCompatible', defaultMessage: 'OpenAI-compatible' }),
  deepseek: defineMessage({ id: 'settings.ai.kind.deepseek', defaultMessage: 'DeepSeek' }),
};

const KIND_ORDER: AIProviderKind[] = ['openrouter', 'openai-compatible', 'deepseek'];

interface FormState {
  kind: AIProviderKind;
  name: string;
  baseURL: string;
  apiKey: string;
  syncEnabled: boolean;
  /** Models detected in the form; saved along with the profile. */
  models: AIProviderProfile['models'];
}

function emptyForm(): FormState {
  return {
    kind: 'openrouter',
    name: '',
    baseURL: KIND_BASE_URLS.openrouter,
    apiKey: '',
    syncEnabled: false,
    models: [],
  };
}

function formFromProfile(profile: AIProviderProfile): FormState {
  return {
    kind: profile.kind,
    name: profile.name,
    baseURL: profile.baseURL,
    apiKey: profile.apiKey,
    syncEnabled: profile.syncEnabled,
    models: profile.models,
  };
}

/** Parses a comma-separated model id string into AIModel-shaped entries. */
function parseModelIds(raw: string): AIProviderProfile['models'] {
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => ({ id, name: id }));
}

interface ProviderFormDialogProps {
  open: boolean;
  /** The profile being edited, or null when adding a new profile. */
  editing: AIProviderProfile | null;
  onOpenChange: (open: boolean) => void;
  onSave: (form: FormState) => void;
  /** False when the signer can't encrypt (no NIP-44), so sync is impossible. */
  hasNip44Support: boolean;
}

function ProviderFormDialog({ open, editing, onOpenChange, onSave, hasNip44Support }: ProviderFormDialogProps) {
  const intl = useIntl();
  const { config } = useAppContext();
  const [form, setForm] = useState<FormState>(emptyForm);
  // True only after the user typed/pasted into the apiKey field, so opening
  // the dialog never counts as an apiKey change for auto-detect.
  const [apiKeyEdited, setApiKeyEdited] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState(false);

  // Re-seed the form whenever the dialog opens (or the edited profile changes).
  useEffect(() => {
    if (!open) {
      setApiKeyEdited(false);
      return;
    }
    setForm(editing ? formFromProfile(editing) : emptyForm());
    setApiKeyEdited(false);
  }, [open, editing]);

  const canSave = form.name.trim().length > 0 && form.baseURL.trim().length > 0;

  function handleKindChange(kind: AIProviderKind) {
    setForm((f) => ({ ...f, kind, baseURL: KIND_BASE_URLS[kind] }));
  }

  /** Detects models for the current form values; shared by auto-detect and the button. */
  async function runDetect() {
    const apiKeyAtCall = form.apiKey;
    setDetecting(true);
    setDetectError(false);
    try {
      const provider: AIProvider = {
        id: form.kind,
        name: form.name,
        baseURL: form.baseURL,
        apiKey: form.apiKey,
        models: [],
      };
      const models = await fetchModels(provider, {
        referer: window.location.origin,
        title: config.appName,
      });
      // Drop stale results if the key changed while the fetch was in flight —
      // the newer key's own debounced detect will populate the models.
      setForm((f) => (f.apiKey === apiKeyAtCall ? { ...f, models } : f));
    } catch {
      setDetectError(true);
    } finally {
      setDetecting(false);
    }
  }

  useAutoDetectModels({
    apiKey: form.apiKey,
    baseURL: form.baseURL,
    userEdited: apiKeyEdited,
    onDetect: runDetect,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {editing ? (
              <FormattedMessage id="settings.ai.dialogTitleEdit" defaultMessage={'Edit Provider'} />
            ) : (
              <FormattedMessage id="settings.ai.dialogTitleAdd" defaultMessage={'Add AI Provider'} />
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ai-provider-kind" className="text-sm font-medium">
              <FormattedMessage id="settings.ai.kindLabel" defaultMessage={'Provider'} />
            </Label>
            <Select value={form.kind} onValueChange={(value) => handleKindChange(value as AIProviderKind)}>
              <SelectTrigger id="ai-provider-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_ORDER.map((kind) => (
                  <SelectItem key={kind} value={kind}>
                    <FormattedMessage {...KIND_LABELS[kind]} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-provider-name" className="text-sm font-medium">
              <FormattedMessage id="settings.ai.nameLabel" defaultMessage={'Name'} />
            </Label>
            <Input
              id="ai-provider-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder={intl.formatMessage({ id: 'settings.ai.namePlaceholder', defaultMessage: 'My provider' })}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-provider-base-url" className="text-sm font-medium">
              <FormattedMessage id="settings.ai.baseUrlLabel" defaultMessage={'Base URL'} />
            </Label>
            <Input
              id="ai-provider-base-url"
              value={form.baseURL}
              onChange={(e) => setForm((f) => ({ ...f, baseURL: e.target.value }))}
              placeholder="https://api.example.com/v1"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ai-provider-api-key" className="text-sm font-medium">
              <FormattedMessage id="settings.ai.apiKeyLabel" defaultMessage={'API key'} />
            </Label>
            <Input
              id="ai-provider-api-key"
              type="password"
              autoComplete="off"
              value={form.apiKey}
              onChange={(e) => {
                setApiKeyEdited(true);
                setForm((f) => ({ ...f, apiKey: e.target.value }));
              }}
              placeholder={intl.formatMessage({ id: 'settings.ai.apiKeyPlaceholder', defaultMessage: 'sk-...' })}
            />
            {!form.syncEnabled && (
              <p className="text-xs text-muted-foreground">
                <FormattedMessage id="settings.ai.localOnlyWarning" defaultMessage={'Stored unencrypted on this device only'} />
              </p>
            )}
          </div>

          {/* Auto-detect status and the manual retry button share this inline UI. */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              {detecting ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="size-3 animate-spin" />
                  <FormattedMessage id="settings.ai.detecting" defaultMessage={'Detecting models…'} />
                </p>
              ) : detectError ? (
                <p className="text-xs text-destructive">
                  <FormattedMessage
                    id="settings.ai.detectFailedInline"
                    defaultMessage={'Model detection failed. Check the base URL and API key, then retry.'}
                  />
                </p>
              ) : form.models.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  <FormattedMessage
                    id="settings.ai.detectedTitle"
                    defaultMessage="{count, plural, one {# model detected} other {# models detected}}"
                    values={{ count: form.models.length }}
                  />
                </p>
              ) : null}
            </div>
            <Button size="sm" variant="outline" onClick={runDetect} disabled={detecting}>
              {detecting && <Loader2 className="size-4 animate-spin" />}
              <FormattedMessage id="settings.ai.detectModels" defaultMessage={'Detect models'} />
            </Button>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="space-y-0.5">
              <Label htmlFor="ai-provider-sync" className="text-sm font-medium">
                <FormattedMessage id="settings.ai.syncLabel" defaultMessage={'Sync across devices'} />
              </Label>
              <p className="text-xs text-muted-foreground">
                {hasNip44Support ? (
                  <FormattedMessage id="settings.ai.syncDescription" defaultMessage={'Encrypts the profile (including the API key) into your Nostr settings.'} />
                ) : (
                  <FormattedMessage id="settings.ai.syncRequiresNip44" defaultMessage={'Sign in with NIP-44 support to sync'} />
                )}
              </p>
            </div>
            <Switch
              id="ai-provider-sync"
              checked={form.syncEnabled}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, syncEnabled: checked }))}
              disabled={!hasNip44Support}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            <FormattedMessage id="settings.ai.cancel" defaultMessage={'Cancel'} />
          </Button>
          <Button onClick={() => onSave(form)} disabled={!canSave}>
            {editing ? (
              <FormattedMessage id="settings.ai.save" defaultMessage={'Save'} />
            ) : (
              <FormattedMessage id="settings.ai.add" defaultMessage={'Add'} />
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SettingsAIPage() {
  const intl = useIntl();
  const { config } = useAppContext();
  const { toast } = useToast();
  const { profiles, addProfile, updateProfile, deleteProfile, duplicateProfile, isLoading, hasNip44Support } = useAIProviders();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<AIProviderProfile | null>(null);
  const [detecting, setDetecting] = useState<Record<string, boolean>>({});
  const [manualIds, setManualIds] = useState<Record<string, string>>({});

  useSeoMeta({
    title: `${intl.formatMessage({ id: 'settings.ai.title', defaultMessage: 'AI' })} | ${intl.formatMessage({ id: 'settings.title', defaultMessage: 'Settings' })} | ${config.appName}`,
    description: intl.formatMessage({ id: 'settings.ai.metaDescription', defaultMessage: 'Manage AI provider profiles for chat' }),
  });

  function openAddDialog() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEditDialog(profile: AIProviderProfile) {
    setEditing(profile);
    setDialogOpen(true);
  }

  function handleSave(form: FormState) {
    if (editing) {
      updateProfile(editing.id, {
        kind: form.kind,
        name: form.name.trim(),
        baseURL: form.baseURL.trim(),
        apiKey: form.apiKey,
        models: form.models,
        syncEnabled: form.syncEnabled,
      });
      toast({
        title: intl.formatMessage({ id: 'settings.ai.savedTitle', defaultMessage: 'Provider updated' }),
      });
    } else {
      addProfile({
        kind: form.kind,
        name: form.name.trim(),
        baseURL: form.baseURL.trim(),
        apiKey: form.apiKey,
        models: form.models,
        syncEnabled: form.syncEnabled,
      });
      toast({
        title: intl.formatMessage({ id: 'settings.ai.addedTitle', defaultMessage: 'Provider added' }),
      });
    }
    setDialogOpen(false);
  }

  async function detectModels(profile: AIProviderProfile) {
    setDetecting((m) => ({ ...m, [profile.id]: true }));
    try {
      const provider: AIProvider = {
        id: profile.kind,
        name: profile.name,
        baseURL: profile.baseURL,
        apiKey: profile.apiKey,
        models: [],
      };
      const models = await fetchModels(provider, {
        referer: window.location.origin,
        title: config.appName,
      });
      updateProfile(profile.id, { models });
      toast({
        title: intl.formatMessage(
          { id: 'settings.ai.detectedTitle', defaultMessage: '{count, plural, one {# model detected} other {# models detected}}' },
          { count: models.length },
        ),
      });
    } catch {
      toast({
        title: intl.formatMessage({ id: 'settings.ai.detectFailedTitle', defaultMessage: 'Model detection failed' }),
        description: intl.formatMessage({ id: 'settings.ai.detectFailedDescription', defaultMessage: 'Enter model IDs manually below.' }),
        variant: 'destructive',
      });
    } finally {
      setDetecting((m) => ({ ...m, [profile.id]: false }));
    }
  }

  function applyManualModels(profile: AIProviderProfile) {
    const models = parseModelIds(manualIds[profile.id] ?? '');
    if (models.length === 0) {
      toast({
        title: intl.formatMessage({ id: 'settings.ai.noModelsTitle', defaultMessage: 'No model IDs entered' }),
        variant: 'destructive',
      });
      return;
    }
    updateProfile(profile.id, { models });
    toast({
      title: intl.formatMessage(
        { id: 'settings.ai.appliedTitle', defaultMessage: '{count, plural, one {# model saved} other {# models saved}}' },
        { count: models.length },
      ),
    });
  }

  return (
    <main className="">
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">
              <FormattedMessage id="settings.ai.title" defaultMessage={'AI'} />
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              <FormattedMessage id="settings.ai.subtitle" defaultMessage={'Configure AI providers used for chat and other AI features.'} />
            </p>
          </div>
        }
      />

      <div className="p-4 space-y-4">
        {/* Intro */}
        <div className="flex items-center gap-4 px-3 pt-2 pb-4">
          <IntroImage src="/ai-intro.png" />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">
              <FormattedMessage id="settings.ai.providersTitle" defaultMessage={'AI Providers'} />
            </h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              <FormattedMessage id="settings.ai.providersDescription" defaultMessage={'Add providers such as OpenRouter or any OpenAI-compatible endpoint.'} />
            </p>
          </div>
        </div>

        {/* AI Providers */}
        <div className="relative px-3 py-3.5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">
              <FormattedMessage id="settings.ai.providersTitle" defaultMessage={'AI Providers'} />
            </h2>
            <Button onClick={openAddDialog} className="shrink-0">
              <Plus className="size-4" />
              <FormattedMessage id="settings.ai.addProfile" defaultMessage={'Add Profile'} />
            </Button>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-full" />
        </div>

        {isLoading ? (
          <div className="space-y-3 px-3">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-28 w-full rounded-xl" />
          </div>
        ) : profiles.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-12 px-8 text-center">
              <p className="text-muted-foreground max-w-sm mx-auto text-sm">
                <FormattedMessage id="settings.ai.empty" defaultMessage={'No AI providers yet. Add one to start using custom chat models.'} />
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3 px-3">
            {profiles.map((profile) => (
              <Card key={profile.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CardTitle className="text-base truncate">{profile.name}</CardTitle>
                      <span className="text-xs text-muted-foreground shrink-0">
                        <FormattedMessage {...KIND_LABELS[profile.kind]} />
                      </span>
                      <span className="text-xs shrink-0">
                        {profile.syncEnabled ? (
                          <FormattedMessage id="settings.ai.syncedBadge" defaultMessage={'Synced'} />
                        ) : (
                          <FormattedMessage id="settings.ai.localOnlyBadge" defaultMessage={'Local only'} />
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditDialog(profile)}>
                        <FormattedMessage id="settings.ai.edit" defaultMessage={'Edit'} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => duplicateProfile(profile.id)}>
                        <FormattedMessage id="settings.ai.duplicate" defaultMessage={'Duplicate'} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => deleteProfile(profile.id)}
                      >
                        <FormattedMessage id="settings.ai.delete" defaultMessage={'Delete'} />
                      </Button>
                    </div>
                  </div>
                  <CardDescription className="truncate">{profile.baseURL}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground">
                      <FormattedMessage
                        id="settings.ai.modelCount"
                        defaultMessage="{count, plural, one {# model} other {# models}}"
                        values={{ count: profile.models.length }}
                      />
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!!detecting[profile.id]}
                      onClick={() => detectModels(profile)}
                    >
                      {detecting[profile.id] && <Loader2 className="size-4 animate-spin" />}
                      <FormattedMessage id="settings.ai.detectModels" defaultMessage={'Detect models'} />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      aria-label={intl.formatMessage({ id: 'settings.ai.manualModelsLabel', defaultMessage: 'Model IDs (comma-separated)' })}
                      placeholder={intl.formatMessage({ id: 'settings.ai.manualModelsPlaceholder', defaultMessage: 'model-1, model-2' })}
                      className="flex-1"
                      value={manualIds[profile.id] ?? profile.models.map((m) => m.id).join(', ')}
                      onChange={(e) => setManualIds((m) => ({ ...m, [profile.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="secondary" onClick={() => applyManualModels(profile)}>
                      <FormattedMessage id="settings.ai.applyModels" defaultMessage={'Apply'} />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ProviderFormDialog
        open={dialogOpen}
        editing={editing}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
        hasNip44Support={hasNip44Support}
      />
    </main>
  );
}
