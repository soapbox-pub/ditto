import { useEffect, useRef, useState } from 'react';

import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** A user-configured AI provider (OpenRouter, OpenAI-compatible, or DeepSeek). */
export interface AIProviderProfile {
  id: string;
  kind: 'openrouter' | 'openai-compatible' | 'deepseek';
  name: string;
  baseURL: string;
  apiKey: string;
  models: { id: string; name: string; contextWindow?: number }[];
  /** When true the profile is written to the encrypted settings blob (NIP-78). */
  syncEnabled: boolean;
}

export type AIProviderKind = AIProviderProfile['kind'];

const STORAGE_KEY = 'ditto:ai-providers';

/**
 * localStorage key holding a user's profiles, scoped per signed-in pubkey
 * (`ditto:ai-providers-${pubkey}` when logged in, a fixed fallback key when
 * logged out) so profiles — including plaintext apiKeys — never leak between
 * simultaneously logged-in accounts on the same device.
 */
function storageKeyFor(pubkey: string | undefined): string {
  return pubkey ? `${STORAGE_KEY}-${pubkey}` : STORAGE_KEY;
}

function loadProfiles(key: string): AIProviderProfile[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AIProviderProfile[]) : [];
  } catch {
    return [];
  }
}

function persistProfiles(key: string, profiles: AIProviderProfile[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(profiles));
  } catch {
    // localStorage may be unavailable (private mode etc.)
  }
}

/**
 * LocalStorage-backed reactive store for AI provider profiles.
 * Profiles live in a per-pubkey localStorage key; profiles with
 * syncEnabled: true are additionally mirrored into the encrypted settings
 * blob (NIP-78) for cross-device sync.
 */
export function useAIProviders() {
  const encryptedSettings = useEncryptedSettings();
  const { user } = useCurrentUser();
  const storageKey = storageKeyFor(user?.pubkey);
  const [profiles, setProfiles] = useState<AIProviderProfile[]>(() => loadProfiles(storageKey));

  // Keep refs so mutation handlers always see the latest list and key.
  const profilesRef = useRef(profiles);
  const storageKeyRef = useRef(storageKey);
  useEffect(() => {
    profilesRef.current = profiles;
    storageKeyRef.current = storageKey;
  }, [profiles, storageKey]);

  // Reload from the current pubkey's key whenever the signed-in user changes
  // (e.g. an account switch), so one account never sees another's profiles.
  // Then merge profiles from the encrypted blob into local state. Blob
  // versions win for matching ids; blob-only profiles are added; non-synced
  // local profiles are left untouched.
  const blobProfiles = encryptedSettings.settings?.aiProviderProfiles;
  useEffect(() => {
    const stored = loadProfiles(storageKey);
    if (!blobProfiles || blobProfiles.length === 0) {
      setProfiles(stored);
      return;
    }
    const merged = [...stored];
    for (const blobProfile of blobProfiles) {
      const index = merged.findIndex((p) => p.id === blobProfile.id);
      if (index >= 0) {
        merged[index] = blobProfile;
      } else {
        merged.push(blobProfile);
      }
    }
    setProfiles(merged);
    persistProfiles(storageKey, merged);
  }, [storageKey, blobProfiles]);

  /** Mirror the current sync-enabled profiles into the encrypted blob. */
  function syncToBlob(nextProfiles: AIProviderProfile[]): void {
    if (!encryptedSettings.hasNip44Support) return;
    const synced = nextProfiles.filter((p) => p.syncEnabled);
    encryptedSettings.updateSettings.mutate({ aiProviderProfiles: synced });
  }

  function addProfile(input: Omit<AIProviderProfile, 'id'>): AIProviderProfile {
    const profile: AIProviderProfile = { ...input, id: crypto.randomUUID() };
    const next = [...profilesRef.current, profile];
    setProfiles(next);
    persistProfiles(storageKeyRef.current, next);
    if (profile.syncEnabled) syncToBlob(next);
    return profile;
  }

  function updateProfile(id: string, patch: Partial<Omit<AIProviderProfile, 'id'>>): void {
    const next = profilesRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setProfiles(next);
    persistProfiles(storageKeyRef.current, next);
    const updated = next.find((p) => p.id === id);
    if (updated?.syncEnabled) syncToBlob(next);
  }

  function deleteProfile(id: string): void {
    const removed = profilesRef.current.find((p) => p.id === id);
    const next = profilesRef.current.filter((p) => p.id !== id);
    setProfiles(next);
    persistProfiles(storageKeyRef.current, next);
    // Tell the blob about the removal so the merge effect doesn't re-add the
    // deleted profile from encrypted settings on the next reload/refetch.
    if (removed?.syncEnabled) syncToBlob(next);
  }

  function duplicateProfile(id: string): void {
    const original = profilesRef.current.find((p) => p.id === id);
    if (!original) return;
    const copy: AIProviderProfile = {
      ...original,
      id: crypto.randomUUID(),
      name: `${original.name} (copy)`,
      syncEnabled: false,
    };
    const next = [...profilesRef.current, copy];
    setProfiles(next);
    persistProfiles(storageKeyRef.current, next);
  }

  return {
    profiles,
    addProfile,
    updateProfile,
    deleteProfile,
    duplicateProfile,
    isLoading: encryptedSettings.isLoading,
    hasNip44Support: encryptedSettings.hasNip44Support,
  };
}
