import type { Draft } from '@/hooks/useDrafts';

const DRAFTS_KEY = 'article-drafts';

/** Save a draft to localStorage. Returns the draft ID or null on failure. */
export function saveDraft(draft: Omit<Draft, 'id' | 'updatedAt'> & { id?: string }): string | null {
  try {
    const stored = localStorage.getItem(DRAFTS_KEY);
    const drafts: Draft[] = stored ? JSON.parse(stored) : [];

    const existingIndex = draft.id
      ? drafts.findIndex(d => d.id === draft.id)
      : drafts.findIndex(d => d.slug === draft.slug);

    const newDraft: Draft = {
      ...draft,
      id: draft.id || (existingIndex >= 0 ? drafts[existingIndex].id : crypto.randomUUID()),
      updatedAt: Date.now(),
    };

    if (existingIndex >= 0) {
      drafts[existingIndex] = newDraft;
    } else {
      drafts.unshift(newDraft);
    }

    // Keep only the 20 most recent drafts
    const trimmedDrafts = drafts.slice(0, 20);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(trimmedDrafts));

    return newDraft.id;
  } catch (error) {
    console.error('Failed to save draft:', error);
    return null;
  }
}

/** Delete a draft by slug from localStorage. */
export function deleteDraftBySlug(slug: string): void {
  try {
    const stored = localStorage.getItem(DRAFTS_KEY);
    if (!stored) return;

    const drafts: Draft[] = JSON.parse(stored);
    const filtered = drafts.filter(d => d.slug !== slug);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete draft:', error);
  }
}

/** Delete a draft by id from localStorage. Returns the remaining drafts. */
export function deleteLocalDraftById(id: string): Draft[] {
  try {
    const stored = localStorage.getItem(DRAFTS_KEY);
    if (!stored) return [];

    const drafts: Draft[] = JSON.parse(stored);
    const filtered = drafts.filter(d => d.id !== id);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(filtered));
    return filtered;
  } catch (error) {
    console.error('Failed to delete draft:', error);
    return [];
  }
}

/** Get all local drafts. */
export function getLocalDrafts(): Draft[] {
  try {
    const stored = localStorage.getItem(DRAFTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}
