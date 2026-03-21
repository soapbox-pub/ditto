export interface ShopCategory {
  id: string;
  label: string;
}

export const SHOP_CATEGORIES: ShopCategory[] = [
  { id: 'all', label: 'All' },
  { id: 'flags', label: 'Flags & Countries' },
  { id: 'identity', label: 'Identity & Pride' },
  { id: 'causes', label: 'Causes & Activism' },
  { id: 'interests', label: 'Interests & Hobbies' },
  { id: 'animals', label: 'Animals & Pets' },
  { id: 'crypto', label: 'Crypto & Tech' },
  { id: 'memes', label: 'Memes & Culture' },
  { id: 'nostr', label: 'Nostr Community' },
  { id: 'limited', label: 'Limited Edition' },
];
