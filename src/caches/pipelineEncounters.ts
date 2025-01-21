import { LRUCache } from 'lru-cache';

export const pipelineEncounters = new LRUCache<string, true>({ max: 5000 });
