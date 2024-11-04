import type { PleromaConfig } from '@/schemas/pleroma-api.ts';

export class PleromaConfigDB {
  constructor(private configs: PleromaConfig[]) {
  }

  get(group: string, key: string): PleromaConfig | undefined {
    return this.configs.find((c) => c.group === group && c.key === key);
  }

  set(group: string, key: string, value: PleromaConfig): void {
    const index = this.configs.findIndex((c) => c.group === group && c.key === key);
    if (index === -1) {
      this.configs.push(value);
    } else {
      this.configs[index] = value;
    }
  }

  merge(configs: PleromaConfig[]): void {
    for (const { group, key, value } of configs) {
      this.set(group, key, { group, key, value });
    }
  }

  toJSON(): PleromaConfig[] {
    return this.configs;
  }
}
