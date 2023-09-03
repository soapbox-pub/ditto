import { User } from '@/db/users.ts';
interface EventData {
  user: User | undefined;
}

export type { EventData };
