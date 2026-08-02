import { useEffect, useRef, useState } from 'react';

import { useEncryptedSettings } from '@/hooks/useEncryptedSettings';

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

function loadProfiles(): AIProviderProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AIProviderProfile[]) : [];
  } catch {
    return [];
  }
}

function persistProfiles(profiles: AIProviderProfile[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // localStorage may be unavailable (private mode etc.)
  }
}

/**
 * LocalStorage-backed reactive store for AI provider profiles.
 * Profiles live in localStorage['ditto:ai-providers'] always; profiles with
 * syncEnabled: true are additionally mirrored into the encrypted settings
 * blob (NIP-78) for cross-device sync.
 */
export function useAIProviders() {
  const encryptedSettings = useEncryptedSettings();
  const [profiles, setProfiles] = useState<AIProviderProfile[]>(() => loadProfiles());

  // Keep a ref so mutation handlers always see the latest list.
  const profilesRef = useRef(profiles);
  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  // Merge profiles from the encrypted blob into local state. Blob versions
  // win for matching ids; blob-only profiles are added; non-synced local
  // profiles are left untouched.
  const blobProfiles = encryptedSettings.settings?.aiProviderProfiles;
  useEffect(() => {
    if (!blobProfiles || blobProfiles.length === 0) return;
    const merged = [...profilesRef.current];
    for (const blobProfile of blobProfiles) {
      const index = merged.findIndex((p) => p.id === blobProfile.id);
      if (index >= 0) {
        merged[index] = blobProfile;
      } else {
        merged.push(blobProfile);
      }
    }
    setProfiles(merged);
    persistProfiles(merged);
  }, [blobProfiles]);

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
    persistProfiles(next);
    if (profile.syncEnabled) syncToBlob(next);
    return profile;
  }

  function updateProfile(id: string, patch: Partial<Omit<AIProviderProfile, 'id'>>): void {
    const next = profilesRef.current.map((p) => (p.id === id ? { ...p, ...patch } : p));
    setProfiles(next);
    persistProfiles(next);
    const updated = next.find((p) => p.id === id);
    if (updated?.syncEnabled) syncToBlob(next);
  }

  function deleteProfile(id: string): void {
    const removed = profilesRef.current.find((p) => p.id === id);
    const next = profilesRef.current.filter((p) => p.id !== id);
    setProfiles(next);
    persistProfiles(next);
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
    persistProfiles(next);
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
